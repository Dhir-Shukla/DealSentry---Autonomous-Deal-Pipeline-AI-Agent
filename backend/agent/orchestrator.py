import asyncio
import json
import os
import time
from datetime import datetime

import anthropic

from agent.mcp_client import McpClient
from agent.prompts import SYSTEM_PROMPT

_RETRY_DELAYS = [15, 30, 60]  # seconds between retries on rate limit


async def _create_message(client, **kwargs):
    """Wraps client.messages.create with exponential backoff on rate limit errors."""
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

    The entire flow goes through the MCP server. There is no direct DB access.
    Tool definitions are fetched from the MCP at runtime. There are no hardcoded schemas.
    """

    mcp = McpClient(os.getenv("MCP_SERVER_URL"))
    client = anthropic.AsyncAnthropic()  # reads ANTHROPIC_API_KEY from env

    # Step 1: Discover available tools from MCP
    tools = await mcp.list_tools()

    # Step 2: Create a new sweep run via MCP
    run_result = await mcp.call_tool("create_run", {})
    run_id = run_result["run"]["id"]

    # Step 3: Get all active deals via MCP
    deals_result = await mcp.call_tool("get_deals", {})
    deals = deals_result["deals"]

    # Step 4: Process deals concurrently with bounded concurrency
    semaphore = asyncio.Semaphore(2)
    results_queue = asyncio.Queue()

    async def analyze_deal(deal):
        async with semaphore:
            try:
                await results_queue.put({
                    "deal_id": deal["id"],
                    "company_name": deal["company_name"],
                    "status": "analyzing",
                })

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

                # Tool-calling loop — relay between Claude and MCP server
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

                elapsed = round(time.time() - start_time, 1)

                final_text = next(
                    (block.text for block in response.content if block.type == "text"),
                    None,
                )

                await results_queue.put({
                    "deal_id": deal["id"],
                    "company_name": deal["company_name"],
                    "status": "complete",
                    "elapsed_seconds": elapsed,
                    "actions_created": actions_count,
                    "summary": final_text[:200] if final_text else None,
                })

                return {"analyzed": 1, "actions": actions_count}

            except Exception as e:
                await results_queue.put({
                    "deal_id": deal["id"],
                    "company_name": deal["company_name"],
                    "status": "error",
                    "error": str(e),
                })
                return {"analyzed": 1, "actions": 0, "error": True}

    # Launch all deal analyses concurrently (bounded by semaphore)
    tasks = [asyncio.create_task(analyze_deal(deal)) for deal in deals]

    # Yield events from the queue as they arrive
    completed = 0
    total = len(deals)
    total_actions = 0

    while completed < total:
        event = await results_queue.get()
        yield event
        if event.get("status") in ("complete", "error"):
            completed += 1
            total_actions += event.get("actions_created", 0)

    # Wait for all tasks to fully finish
    await asyncio.gather(*tasks)

    # Step 5: Complete the run via MCP
    await mcp.call_tool("complete_run", {
        "run_id": run_id,
        "deals_analyzed": total,
        "actions_created": total_actions,
    })

    yield {
        "status": "sweep_complete",
        "run_id": run_id,
        "deals_analyzed": total,
        "actions_created": total_actions,
    }
