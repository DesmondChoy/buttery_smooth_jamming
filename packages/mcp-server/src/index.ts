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
  status: 'idle' | 'thinking' | 'playing' | 'error' | 'timeout';
}

interface JamState {
  sessionId: string;
  currentRound: number;
  musicalContext: MusicalContext;
  agents: Record<string, AgentState>;
  activeAgents: string[];
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
  activeAgents: ['drums', 'bass', 'melody', 'fx'],
};

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

async function sendWithRetry(
  type: string,
  payload: object
): Promise<{ success: boolean; error?: string }> {
  let result = send(type, payload);
  if (!result.success) {
    // Force reconnect and retry once
    ws?.terminate();
    ws = null;
    const connected = await connect();
    if (connected) {
      result = send(type, payload);
    }
  }
  return result;
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

// Tool: get_jam_state
server.tool(
  "get_jam_state",
  "Get the current jam session state including musical context and all agent states",
  {},
  async () => {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(jamState, null, 2),
        },
      ],
    };
  }
);

// Tool: update_agent_state
server.tool(
  "update_agent_state",
  "Update a specific agent's state (pattern, thoughts, reaction, status)",
  {
    agent: z.string().describe("Agent role: drums, bass, melody, or fx"),
    pattern: z.string().describe("Strudel code for this agent"),
    thoughts: z.string().describe("Agent's musical reasoning"),
    reaction: z.string().describe("Agent's reaction to the current jam"),
    status: z
      .enum(["idle", "thinking", "playing", "error", "timeout"])
      .optional()
      .default("idle")
      .describe("Agent status"),
  },
  async ({ agent, pattern, thoughts, reaction, status }) => {
    if (!VALID_AGENTS.includes(agent)) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Invalid agent "${agent}". Must be one of: ${VALID_AGENTS.join(", ")}`,
          },
        ],
      };
    }

    const agentState = jamState.agents[agent];
    agentState.pattern = pattern;
    agentState.thoughts = thoughts;
    agentState.reaction = reaction;
    agentState.status = status;
    agentState.lastUpdated = new Date().toISOString();

    // Only update fallbackPattern when status is "idle" (valid pattern)
    if (status === "idle") {
      agentState.fallbackPattern = pattern;
    }

    // Broadcast to browsers via /api/ws (with retry on failure)
    await connect();
    await sendWithRetry("agent_status", { agent, status });
    if (thoughts || reaction) {
      await sendWithRetry("agent_thought", {
        agent,
        emoji: agentState.emoji,
        thought: thoughts,
        reaction,
        pattern,
        compliedWithBoss: true,
        timestamp: agentState.lastUpdated,
      });
    }

    const preview = pattern.length > 60 ? pattern.substring(0, 60) + "..." : pattern;
    return {
      content: [
        {
          type: "text",
          text: `Updated ${agent} (${agentState.name}): ${preview}`,
        },
      ],
    };
  }
);

// Tool: update_musical_context
server.tool(
  "update_musical_context",
  "Update the shared musical context (key, scale, bpm, chords, energy)",
  {
    key: z.string().optional().describe("Musical key, e.g. 'C minor', 'D major'"),
    scale: z.array(z.string()).optional().describe("Scale notes, e.g. ['c','d','eb','f','g','ab','bb']"),
    bpm: z.number().optional().describe("Tempo in beats per minute"),
    chordProgression: z.array(z.string()).optional().describe("Chord progression, e.g. ['Cm','Ab','Eb','Bb']"),
    energy: z.number().min(1).max(10).optional().describe("Energy level from 1 (chill) to 10 (intense)"),
  },
  async ({ key, scale, bpm, chordProgression, energy }) => {
    const ctx = jamState.musicalContext;
    if (key !== undefined) ctx.key = key;
    if (scale !== undefined) ctx.scale = scale;
    if (bpm !== undefined) ctx.bpm = bpm;
    if (chordProgression !== undefined) ctx.chordProgression = chordProgression;
    if (energy !== undefined) ctx.energy = energy;

    // Broadcast to browsers via /api/ws
    await connect();
    send("musical_context_update", { musicalContext: { ...ctx } });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(ctx, null, 2),
        },
      ],
    };
  }
);

// Tool: broadcast_jam_state
server.tool(
  "broadcast_jam_state",
  "Broadcast the full jam state and combined pattern to all connected browsers",
  {
    combinedPattern: z.string().describe("The composed Strudel pattern (stack of all agents)"),
    round: z.number().describe("Current round number"),
  },
  async ({ combinedPattern, round }) => {
    jamState.currentRound = round;

    // Auto-set active agents with patterns to 'playing' (preserve error/timeout)
    for (const [key, agent] of Object.entries(jamState.agents)) {
      if (!jamState.activeAgents.includes(key)) {
        agent.status = 'idle';
        continue;
      }
      if (agent.status === 'error' || agent.status === 'timeout') continue;
      agent.status = agent.pattern ? 'playing' : 'idle';
    }

    await connect();
    const result = send("jam_state_update", {
      jamState: { ...jamState, agents: { ...jamState.agents } },
      combinedPattern,
    });
    return {
      content: [{
        type: "text",
        text: result.success
          ? `Jam state broadcast (round ${round})`
          : result.error!,
      }],
    };
  }
);

// Tool: set_active_agents
server.tool(
  "set_active_agents",
  "Set which agents are active for this jam session",
  {
    agents: z.array(z.string()).describe("Array of agent keys to activate, e.g. ['drums', 'bass']"),
  },
  async ({ agents }) => {
    const invalid = agents.filter(a => !VALID_AGENTS.includes(a));
    if (invalid.length > 0) {
      return {
        isError: true,
        content: [{
          type: "text",
          text: `Invalid agent(s): ${invalid.join(', ')}. Must be: ${VALID_AGENTS.join(', ')}`,
        }],
      };
    }

    jamState.activeAgents = agents;

    // Reset inactive agents to idle with empty pattern
    for (const key of VALID_AGENTS) {
      if (!agents.includes(key)) {
        const agent = jamState.agents[key];
        agent.status = 'idle';
        agent.pattern = '';
        agent.thoughts = '';
        agent.reaction = '';
      }
    }

    return {
      content: [{
        type: "text",
        text: `Active agents set to: ${agents.join(', ')}`,
      }],
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
