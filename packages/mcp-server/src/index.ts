import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import WebSocket from "ws";
import { randomUUID } from "crypto";
import { z } from "zod";
import { STRUDEL_REFERENCE } from "./strudel-reference.js";

const server = new McpServer({
  name: "strudel-mcp",
  version: "0.1.0",
});

// WebSocket connection management
const WS_URL = process.env.WS_URL || "ws://localhost:3000/api/ws";
let ws: WebSocket | null = null;
let connectPromise: Promise<boolean> | null = null;

function connect(): Promise<boolean> {
  if (ws?.readyState === WebSocket.OPEN) {
    return Promise.resolve(true);
  }

  // If a connection is already in progress, wait for it
  if (connectPromise) {
    return connectPromise;
  }

  connectPromise = new Promise((resolve) => {
    ws = new WebSocket(WS_URL);

    ws.on("open", () => {
      connectPromise = null;
      console.error("WebSocket connected to", WS_URL);
      resolve(true);
    });

    ws.on("error", (error) => {
      connectPromise = null;
      console.error("WebSocket error:", error.message);
      resolve(false);
    });

    ws.on("close", () => {
      connectPromise = null;
      ws = null;
      console.error("WebSocket disconnected");
    });
  });

  return connectPromise;
}

function send(
  type: string,
  payload: object
): { success: boolean; error?: string } {
  if (ws?.readyState !== WebSocket.OPEN) {
    return {
      success: false,
      error: `WebSocket not connected. Ensure the web app is running at ${WS_URL}`,
    };
  }

  try {
    ws.send(JSON.stringify({ type, payload }));
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: `Failed to send message: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// Tool: execute_pattern
server.tool(
  "execute_pattern",
  "Send Strudel code to the web app for execution",
  { code: z.string().describe("Strudel/Tidal code to execute") },
  async ({ code }) => {
    await connect();
    const result = send("execute", { code });
    return {
      content: [
        {
          type: "text",
          text: result.success
            ? `Pattern sent for execution: ${code.substring(0, 100)}${code.length > 100 ? "..." : ""}`
            : result.error!,
        },
      ],
    };
  }
);

// Tool: stop_pattern
server.tool(
  "stop_pattern",
  "Stop the currently playing pattern",
  {},
  async () => {
    await connect();
    const result = send("stop", {});
    return {
      content: [
        {
          type: "text",
          text: result.success ? "Stop signal sent" : result.error!,
        },
      ],
    };
  }
);

// Tool: send_message
server.tool(
  "send_message",
  "Send a chat message to display in the web app",
  { text: z.string().describe("Message text to display") },
  async ({ text }) => {
    await connect();
    const result = send("message", {
      id: randomUUID(),
      text,
      timestamp: new Date().toISOString(),
    });
    return {
      content: [
        {
          type: "text",
          text: result.success ? "Message sent" : result.error!,
        },
      ],
    };
  }
);

// Resource: strudel://reference
server.resource(
  "strudel-reference",
  "strudel://reference",
  {
    description: "Strudel pattern language API reference",
    mimeType: "text/markdown",
  },
  async (uri) => ({
    contents: [
      {
        uri: uri.toString(),
        mimeType: "text/markdown",
        text: STRUDEL_REFERENCE,
      },
    ],
  })
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Strudel MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
