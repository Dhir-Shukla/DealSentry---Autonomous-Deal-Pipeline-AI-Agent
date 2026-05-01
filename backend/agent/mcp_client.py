import httpx


class McpClient:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")

    async def list_tools(self) -> list[dict]:
        """Fetches tool definitions from the MCP server. Returns list of tool schemas
        ready to pass directly to the Anthropic API tools parameter."""
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                self.base_url,
                json={"tool": "list_tools", "arguments": {}},
            )
            response.raise_for_status()
            return response.json()["tools"]

    async def call_tool(self, tool_name: str, arguments: dict) -> dict:
        """Generic method to call any tool on the MCP server by name.
        This is the ONLY method that executes tools — no tool-specific methods needed."""
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                self.base_url,
                json={"tool": tool_name, "arguments": arguments},
            )
            if not response.is_success:
                raise RuntimeError(
                    f"MCP tool '{tool_name}' failed with {response.status_code}: {response.text}"
                )
            return response.json()
