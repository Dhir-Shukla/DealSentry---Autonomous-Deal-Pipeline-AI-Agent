import asyncio
import json
import os
import time
from datetime import datetime

import anthropic

from agent.mcp_client import McpClient
from agent.prompts import SYSTEM_PROMPT

_RETRY_DELAYS = [15, 30, 60]  # seconds between retries on rate limit

# Hard cap per deal: 3 minutes. Prevents a single stuck API call from freezing the sweep.
_DEAL_TIMEOUT_SECONDS = 180


async def _create_message(client, **kwargs):
    for attempt, delay in enumerate([0] + _RETRY_DELAYS):
        if delay:
            await asyncio.sleep(delay)
        try:
            return await client.messages.create(**kwargs)
        except anthropic.RateLimitError:
            if attempt == len(_RETRY_DELAYS):
                raise


async def run_sweep():
    """
    Runs a full pipeline sweep. Async generator that yields dict events for SSE streaming.

    Event shape (all events carry a "type" field the frontend switches on):
      {"type": "start",         "total_deals": N}
      {"type": "deal_start",    "deal_id": N, "company_name": "..."}
      {"type": "deal_complete", "deal_id": N, "company_name": "...", "actions_created": N, "elapsed_seconds": N}
      {"type": "deal_error",    "deal_id": N, "company_name": "...", "error": "..."}
      {"type": "complete",      "run_id": N, "deals_analyzed": N, "actions_created": N}

    The entire flow goes through the MCP server — no direct DB access.
    Tool definitions are fetched from the MCP at runtime.
    """

    mcp = McpClient(os.getenv("MCP_SERVER_URL"))
    # 60 s per API call — prevents a single hung request from blocking the sweep.
    # The per-deal asyncio.wait_for(timeout=180) is the hard outer cap.
    client = anthropic.AsyncAnthropic(timeout=60.0)

    # Step 1: Discover available tools from MCP
    tools = await mcp.list_tools()

    # Step 2: Create a new sweep run via MCP
    run_result = await mcp.call_tool("create_run", {})
    run_id = run_result["run"]["id"]

    # Step 3: Get all active deals via MCP
    deals_result = await mcp.call_tool("get_deals", {})
    deals = deals_result["deals"]
    total = len(deals)

    yield {"type": "start", "total_deals": total}

    # Step 4: Process deals concurrently with bounded concurrency
    semaphore = asyncio.Semaphore(2)
    results_queue: asyncio.Queue[dict] = asyncio.Queue()

    async def _analyze_core(deal: dict) -> tuple[int, float]:
        """Inner logic for one deal. Returns (actions_count, elapsed_seconds)."""
        start_time = time.time()
        actions_count = 0

        user_message = (
            f"Analyze deal #{deal['id']}: {deal['company_name']}\n"
            f"Type: {deal['deal_type']}, Stage: {deal['stage']}\n"
            f"Value: ${deal['total_value']}\n"
            f"Buyer: {deal.get('buyer_name', 'N/A')}, Seller: {deal.get('seller_name', 'N/A')}\n"
            f"Assigned Rep: {deal.get('assigned_rep', 'N/A')}\n"
            f"Last Activity: {deal.get('last_activity_at', 'N/A')}\n"
            f"ROFR Deadline: {deal.get('rofr_deadline', 'N/A')}\n"
            f"Notes: {deal.get('notes', 'None')}\n"
            f"Current Risk Level: {deal.get('risk_level', 'unknown')}\n"
            f"\nToday's date: {datetime.now().strftime('%Y-%m-%d')}\n"
            f"Current sweep run_id: {run_id}\n"
            f"\nAnalyze this deal and take appropriate action(s). If the deal is healthy, update its risk level to low and move on without creating any actions."
        )

        messages = [{"role": "user", "content": user_message}]

        response = await _create_message(client,
            model="claude-sonnet-4-6",
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            tools=tools,
            messages=messages,
        )

        while response.stop_reason == "tool_use":
            assistant_content = []
            tool_results = []

            for block in response.content:
                if block.type == "text":
                    assistant_content.append({"type": "text", "text": block.text})
                elif block.type == "tool_use":
                    assistant_content.append({
                        "type": "tool_use",
                        "id": block.id,
                        "name": block.name,
                        "input": block.input,
                    })

                    try:
                        result = await mcp.call_tool(block.name, block.input)
                    except Exception as e:
                        result = {"error": str(e)}

                    if block.name == "create_action":
                        actions_count += 1

                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": json.dumps(result),
                    })

            messages.append({"role": "assistant", "content": assistant_content})
            messages.append({"role": "user", "content": tool_results})

            response = await _create_message(client,
                model="claude-sonnet-4-6",
                max_tokens=4096,
                system=SYSTEM_PROMPT,
                tools=tools,
                messages=messages,
            )

        return actions_count, round(time.time() - start_time, 1)

    async def analyze_deal(deal: dict) -> None:
        async with semaphore:
            await results_queue.put({
                "type": "deal_start",
                "deal_id": deal["id"],
                "company_name": deal["company_name"],
            })
            try:
                actions_count, elapsed = await asyncio.wait_for(
                    _analyze_core(deal),
                    timeout=_DEAL_TIMEOUT_SECONDS,
                )
                await results_queue.put({
                    "type": "deal_complete",
                    "deal_id": deal["id"],
                    "company_name": deal["company_name"],
                    "actions_created": actions_count,
                    "elapsed_seconds": elapsed,
                })
            except asyncio.TimeoutError:
                await results_queue.put({
                    "type": "deal_error",
                    "deal_id": deal["id"],
                    "company_name": deal["company_name"],
                    "error": f"timed out after {_DEAL_TIMEOUT_SECONDS}s",
                })
            except Exception as e:
                await results_queue.put({
                    "type": "deal_error",
                    "deal_id": deal["id"],
                    "company_name": deal["company_name"],
                    "error": str(e),
                })

    tasks = [asyncio.create_task(analyze_deal(deal)) for deal in deals]

    completed = 0
    total_actions = 0

    while completed < total:
        event = await results_queue.get()
        yield event
        if event.get("type") in ("deal_complete", "deal_error"):
            completed += 1
            total_actions += event.get("actions_created", 0)

    # Clean up tasks (all should be done; return_exceptions avoids blocking on any straggler)
    await asyncio.gather(*tasks, return_exceptions=True)

    # Step 5: Mark the run complete via MCP
    try:
        await mcp.call_tool("complete_run", {
            "run_id": run_id,
            "deals_analyzed": total,
            "actions_created": total_actions,
        })
    except Exception as e:
        yield {"type": "error", "error": f"complete_run failed: {e}"}
        return

    yield {
        "type": "complete",
        "run_id": run_id,
        "deals_analyzed": total,
        "actions_created": total_actions,
    }
