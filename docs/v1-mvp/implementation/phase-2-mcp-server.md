# Phase 2: MCP Server (Thin Bridge) ✅

**Goal:** MCP server Claude Code can connect to, with 4 tools and 2 resources.

## Files Created

```
packages/mcp-server/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts               # Server entry
│   └── strudel-reference.ts   # Embedded API docs
└── build/                     # Compiled output
.mcp.json                      # MCP configuration at project root
```

## MCP Tools (4 total)

| Tool | Description |
|------|-------------|
| `execute_pattern(code)` | Send Strudel code to web app for playback |
| `stop_pattern()` | Stop current playback |
| `send_message(text)` | Send explanation to chat panel |
| `get_user_messages()` | Retrieve pending messages from web users (clears queue) |

## MCP Resources (2 total)

| Resource | URI | Description |
|----------|-----|-------------|
| Strudel Reference | `strudel://reference` | Embedded Strudel API documentation |
| User Messages | `strudel://user-messages` | Pending messages from web users (JSON) |

## Key Code: index.ts

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import WebSocket from "ws";
import { z } from "zod";

const server = new McpServer({ name: "strudel-mcp", version: "0.1.0" });
const WS_URL = process.env.WS_URL || "ws://localhost:3000/api/ws";
const CONNECTION_TIMEOUT_MS = 5000;
let ws: WebSocket | null = null;

// Message queue for user messages from the web app
const userMessages: UserMessage[] = [];

function connect(): Promise<boolean> {
  // Connection with 5-second timeout
  // Handles incoming user_message events from web app
}

// Tool: execute_pattern
server.tool("execute_pattern", "Send Strudel code to the web app", { ... });

// Tool: stop_pattern
server.tool("stop_pattern", "Stop the currently playing pattern", {});

// Tool: send_message
server.tool("send_message", "Send a chat message to display", { ... });

// Tool: get_user_messages
server.tool("get_user_messages", "Get pending messages from web users", {});

// Resource: strudel://reference
server.resource("strudel-reference", "strudel://reference", { ... });

// Resource: strudel://user-messages
server.resource("user-messages", "strudel://user-messages", { ... });

const transport = new StdioServerTransport();
await server.connect(transport);
```

### Implementation Details

1. **Lazy Connection**: WebSocket connects on first tool call, not at startup
2. **Message Queue**: `get_user_messages` returns and clears the queue
3. **Timeout**: 5-second connection timeout prevents indefinite hanging
4. **Bidirectional**: Server receives `user_message` events from web app

## Configuration: .mcp.json

Place at project root for Claude Code auto-discovery:

```json
{
  "mcpServers": {
    "strudel": {
      "type": "stdio",
      "command": "node",
      "args": ["packages/mcp-server/build/index.js"],
      "env": {
        "WS_URL": "ws://localhost:3000/api/ws"
      }
    }
  }
}
```

## Dependencies

```json
{
  "@modelcontextprotocol/sdk": "^1.x",
  "ws": "^8.x",
  "zod": "^3.x"
}
```

## Build & Test

```bash
# Build the server
cd packages/mcp-server && npm run build

# Test with MCP Inspector
npx @modelcontextprotocol/inspector

# Verify in Claude Code
claude  # From project root - MCP server auto-discovered
```

## Verification Steps

1. `cd packages/mcp-server && npm run build`
2. Test with MCP Inspector: `npx @modelcontextprotocol/inspector`
3. Tools appear, resources readable
4. Start Claude Code in project → MCP server recognized
