import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({
  name: "strudel-mcp",
  version: "0.1.0",
});

// Tools and resources will be added by subsequent issues (m83, qvx)

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Strudel MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
