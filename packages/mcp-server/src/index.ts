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
const CONNECTION_TIMEOUT_MS = 5000;
let ws: WebSocket | null = null;
let connectPromise: Promise<boolean> | null = null;

// Message queue for user messages from the web app
interface UserMessage {
  id: string;
  text: string;
  timestamp: string;
  target?: string | null;
}
const userMessages: UserMessage[] = [];

// @mention parser: case-insensitive, maps @BEAT→drums, @GROOVE→bass, etc.
const MENTION_TO_AGENT: Record<string, string> = {
  '@beat': 'drums',
  '@groove': 'bass',
  '@aria': 'melody',
  '@glitch': 'fx',
};

function parseMention(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [mention, agent] of Object.entries(MENTION_TO_AGENT)) {
    // Check if text starts with @mention (followed by space or end of string)
    if (lower.startsWith(mention) && (lower.length === mention.length || lower[mention.length] === ' ')) {
      return agent;
    }
  }
  return null;
}

function connect(): Promise<boolean> {
  if (ws?.readyState === WebSocket.OPEN) {
    return Promise.resolve(true);
  }

  // If a connection is already in progress, wait for it
  if (connectPromise) {
    return connectPromise;
  }

  connectPromise = new Promise((resolve) => {
    const socket = new WebSocket(WS_URL);
    ws = socket;

    // Set up connection timeout
    const timeoutId = setTimeout(() => {
      if (socket.readyState !== WebSocket.OPEN) {
        console.error(`WebSocket connection timeout after ${CONNECTION_TIMEOUT_MS}ms`);
        socket.terminate(); // Force close hanging connection
        connectPromise = null;
        ws = null;
        resolve(false);
      }
    }, CONNECTION_TIMEOUT_MS);

    socket.on("open", () => {
      clearTimeout(timeoutId);
      connectPromise = null;
      console.error("WebSocket connected to", WS_URL);
      resolve(true);
    });

    socket.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "user_message" && msg.payload?.text) {
          const text = String(msg.payload.text);
          const target = parseMention(text);
          userMessages.push({
            id: msg.payload.id || randomUUID(),
            text,
            timestamp: msg.payload.timestamp || new Date().toISOString(),
            target,
          });
          console.error("Received user message:", text.substring(0, 50), target ? `(target: ${target})` : '');
        }
      } catch (err) {
        console.error("Failed to parse incoming message:", err);
      }
    });

    socket.on("error", (error) => {
      clearTimeout(timeoutId);
      connectPromise = null;
      console.error("WebSocket error:", error.message);
      resolve(false);
    });

    socket.on("close", () => {
      clearTimeout(timeoutId);
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
    console.error(`[MCP send] WebSocket not open (state: ${ws?.readyState ?? 'null'}), cannot send ${type}`);
    return {
      success: false,
      error: `Cannot connect to web app at ${WS_URL}.\nPlease ensure the web app is running (npm run dev).`,
    };
  }

  try {
    ws.send(JSON.stringify({ type, payload }));
    return { success: true };
  } catch (error) {
    console.error(`[MCP send] Failed to send ${type}:`, error instanceof Error ? error.message : String(error));
    return {
      success: false,
      error: `Failed to send message: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function validatePatternSyntax(code: string): string | null {
  try {
    // Parse-only validation to catch malformed snippets before dispatching.
    new Function(code);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function normalizeSynthName(name: string): string {
  const normalized = name.trim().toLowerCase();
  if (normalized === "saw") return "sawtooth";
  if (normalized === "tri") return "triangle";
  return normalized;
}

function normalizePatternCode(code: string): { code: string; rewrites: string[] } {
  let normalized = code;
  const rewrites: string[] = [];

  // Common hallucination: .wave("saw") — Strudel uses .s("sawtooth")
  normalized = normalized.replace(
    /\.wave\(\s*(['"])([^'"]+)\1\s*\)/g,
    (_match, _quote, waveName: string) => {
      rewrites.push("wave() -> s()");
      return `.s("${normalizeSynthName(waveName)}")`;
    }
  );

  // Common hallucination: .band() — Strudel uses .bpf()
  if (normalized.includes(".band(")) {
    rewrites.push("band() -> bpf()");
    normalized = normalized.replace(/\.band\(/g, ".bpf(");
  }

  // Common hallucination: .pan(sin) / .pan(sin(rate=...))
  // Strudel exposes `sine` as the modulation source.
  normalized = normalized.replace(
    /\.pan\(\s*sin\s*\(\s*rate\s*=\s*([0-9.]+)\s*\)\s*\)/g,
    (_match, rawRate: string) => {
      const rate = Number.parseFloat(rawRate);
      const slow = Number.isFinite(rate) && rate > 0 ? (1 / rate) : 1;
      const slowRounded = Number(slow.toFixed(3));
      rewrites.push("pan(sin(rate=...)) -> pan(sine.slow(...).range(0,1))");
      return `.pan(sine.slow(${slowRounded}).range(0,1))`;
    }
  );

  normalized = normalized.replace(
    /\.pan\(\s*sin\s*\)/g,
    () => {
      rewrites.push("pan(sin) -> pan(sine.range(0,1))");
      return `.pan(sine.range(0,1))`;
    }
  );

  return { code: normalized, rewrites };
}

// Tool: execute_pattern
server.tool(
  "execute_pattern",
  "Send Strudel code to the web app for execution",
  { code: z.string().describe("Strudel/Tidal code to execute") },
  async ({ code }) => {
    const normalized = normalizePatternCode(code);
    const syntaxError = validatePatternSyntax(normalized.code);
    if (syntaxError) {
      return {
        content: [
          {
            type: "text",
            text:
              "Pattern not sent: JavaScript syntax check failed. " +
              "The current audio was left unchanged.\n" +
              `Details: ${syntaxError}`,
          },
        ],
      };
    }

    await connect();
    const result = send("execute", { code: normalized.code });
    const rewriteNote = normalized.rewrites.length > 0
      ? `\nApplied compatibility rewrites: ${normalized.rewrites.join(", ")}.`
      : "";
    return {
      content: [
        {
          type: "text",
          text: result.success
            ? (
              `Pattern sent for execution: ${normalized.code.substring(0, 100)}${normalized.code.length > 100 ? "..." : ""}` +
              rewriteNote
            )
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

// Tool: get_user_messages
server.tool(
  "get_user_messages",
  "Get pending messages from web users (clears queue after reading)",
  {},
  async () => {
    const connected = await connect();
    const messages = [...userMessages];
    userMessages.length = 0; // Clear queue

    let statusNote = "";
    if (!connected) {
      statusNote = "\n\n(Note: Not connected to web app. Only showing locally queued messages.)";
    }

    return {
      content: [
        {
          type: "text",
          text:
            messages.length > 0
              ? JSON.stringify(messages, null, 2) + statusNote
              : "No new messages" + statusNote,
        },
      ],
    };
  }
);

// Resource: strudel://user-messages
server.resource(
  "user-messages",
  "strudel://user-messages",
  {
    description: "Pending messages from web users",
    mimeType: "application/json",
  },
  async (uri) => ({
    contents: [
      {
        uri: uri.toString(),
        mimeType: "application/json",
        text: JSON.stringify(userMessages),
      },
    ],
  })
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
