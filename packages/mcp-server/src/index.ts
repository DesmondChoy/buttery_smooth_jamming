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
}
const userMessages: UserMessage[] = [];

// Jam session state (types duplicated from lib/types.ts — MCP server can't import from lib/)

interface MusicalContext {
  key: string;
  scale: string[];
  chordProgression: string[];
  bpm: number;
  timeSignature: string;
  energy: number;
}

interface AgentState {
  name: string;
  emoji: string;
  pattern: string;
  fallbackPattern: string;
  thoughts: string;
  reaction: string;
  lastUpdated: string;
  status: 'idle' | 'thinking' | 'error' | 'timeout';
}

interface JamState {
  sessionId: string;
  currentRound: number;
  musicalContext: MusicalContext;
  agents: Record<string, AgentState>;
}

const jamState: JamState = {
  sessionId: "jam-001",
  currentRound: 0,
  musicalContext: {
    key: "C minor",
    scale: ["c", "d", "eb", "f", "g", "ab", "bb"],
    chordProgression: ["Cm", "Ab", "Eb", "Bb"],
    bpm: 120,
    timeSignature: "4/4",
    energy: 5,
  },
  agents: {
    drums:  { name: "BEAT",   emoji: "🥁",  pattern: "", fallbackPattern: "", thoughts: "", reaction: "", status: "idle", lastUpdated: "" },
    bass:   { name: "GROOVE", emoji: "🎸",  pattern: "", fallbackPattern: "", thoughts: "", reaction: "", status: "idle", lastUpdated: "" },
    melody: { name: "ARIA",   emoji: "🎹",  pattern: "", fallbackPattern: "", thoughts: "", reaction: "", status: "idle", lastUpdated: "" },
    fx:     { name: "GLITCH", emoji: "🎛️", pattern: "", fallbackPattern: "", thoughts: "", reaction: "", status: "idle", lastUpdated: "" },
  },
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- consumed by jam state MCP tools (5j9.3)
const VALID_AGENTS = Object.keys(jamState.agents);

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
          userMessages.push({
            id: msg.payload.id || randomUUID(),
            text: msg.payload.text,
            timestamp: msg.payload.timestamp || new Date().toISOString(),
          });
          console.error("Received user message:", String(msg.payload.text).substring(0, 50));
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
    return {
      success: false,
      error: `Cannot connect to web app at ${WS_URL}.\nPlease ensure the web app is running (npm run dev).`,
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
