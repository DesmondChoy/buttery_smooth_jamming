# CC Sick Beats - Implementation Plan

A web app connecting Claude Code to Strudel.cc for AI-assisted live coding music.

## Current Status

**MVP: COMPLETE**

All 3 phases have been implemented:
- Phase 1: Foundation + Strudel integration (audio works)
- Phase 2: MCP Server with bidirectional communication
- Phase 3: Web App with WebSocket bridge

### Optional Features (Not Yet Built)
- Pattern persistence (database)
- Session management
- Audio recording
- Learning/progress tracking
- Curriculum resource

---

## Design Philosophy (Learnings from Similar Projects)

**Inspired by [strudel-mcp-bridge](https://github.com/phildougherty/strudel-mcp-bridge):**
- "Thin bridge" model: Claude generates code, server just forwards it
- Removed 1600 lines of validation → 336 lines by trusting Claude
- Minimal tools (3 total: execute, stop, status)
- Zero config, embedded documentation as MCP resource

**Key principle: Prevent over-engineering. Only build what directly contributes to the core goal.**

---

## MVP vs Optional Features

### MVP (Core Problem: "Claude teaches Strudel via live coding")
- Web app with split panels (chat left, Strudel right)
- MCP server with 4 essential tools
- WebSocket bridge with bidirectional communication
- Embedded Strudel reference

### Optional (Back Burner)
- Pattern persistence (database)
- Session management
- Audio recording
- Learning/progress tracking
- Curriculum resource

---

## MVP Phase 1: Foundation + Strudel Test ✅ COMPLETED

**Goal:** Next.js app that loads Strudel and plays audio.

**Files:**
```
cc_sick_beats/
├── package.json
├── tsconfig.json
├── next.config.js
├── tailwind.config.ts
├── postcss.config.js
├── .gitignore
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── components/
│   └── StrudelEditor.tsx
└── types/
    └── strudel.d.ts           # Type definitions for Strudel web component
```

**Why no monorepo?** Start simple. Add Turborepo later if needed.

**Key Code - StrudelEditor.tsx:**
```tsx
'use client';
import { useEffect, useRef } from 'react';

interface StrudelEditorElement extends HTMLElement {
  editor: {
    setCode: (code: string) => void;
    evaluate: (autostart?: boolean) => void;
    stop: () => void;
    code: string;
  };
}

export function StrudelEditor({ initialCode, onReady, onError, className }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function initStrudel() {
      await import('@strudel/repl');
      const strudelEditor = document.createElement('strudel-editor');
      if (initialCode) strudelEditor.setAttribute('code', initialCode);
      containerRef.current?.appendChild(strudelEditor);
      // Poll for editor ready state with timeout
    }
    initStrudel();
  }, []);

  return <div ref={containerRef} className={className} />;
}
```

**Verification:**
1. `npm install && npm run dev`
2. Strudel editor renders
3. Click play → audio works

---

## MVP Phase 2: MCP Server (Thin Bridge) ✅ COMPLETED

**Goal:** MCP server Claude Code can connect to, with 4 tools and 2 resources.

**Files:**
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

**Tools (4 total):**
1. `execute_pattern(code)` - Send code to web app
2. `stop_pattern()` - Stop playback
3. `send_message(text)` - Send explanation to chat
4. `get_user_messages()` - Retrieve pending messages from web users (clears queue)

**Resources (2 total):**
- `strudel://reference` - Embedded Strudel API documentation
- `strudel://user-messages` - Pending messages from web users (JSON)

**Key Code - index.ts:**
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

**.mcp.json (at project root):**
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

**Verification:**
1. `cd packages/mcp-server && npm run build`
2. Test with MCP Inspector: `npx @modelcontextprotocol/inspector`
3. Tools appear, resources readable
4. Start Claude Code in project → MCP server recognized

---

## MVP Phase 3: Web App + WebSocket Bridge ✅ COMPLETED

**Goal:** Working split-panel app that receives MCP commands and sends user messages back.

**Files:**
```
app/
├── page.tsx                   # Split pane layout with keyboard shortcuts
├── layout.tsx
├── globals.css                # Tailwind + Strudel visualization hiding
└── api/
    ├── ws/route.ts            # WebSocket for Strudel MCP bridge
    └── claude-ws/route.ts     # WebSocket for Claude Terminal integration
components/
├── TerminalPanel.tsx          # Left panel - Claude Terminal with chat
├── StrudelPanel.tsx           # Right panel (wraps StrudelEditor)
├── StrudelEditor.tsx          # Strudel web component wrapper
└── AudioStartButton.tsx       # Browser audio unlock
hooks/
├── index.ts                   # Exports
├── useWebSocket.ts            # Strudel MCP WebSocket connection
├── useClaudeTerminal.ts       # Claude Terminal WebSocket + message handling
└── useStrudel.ts              # setCode, evaluate, stop
lib/
├── types.ts                   # TypeScript types for messages
└── claude-process.ts          # Spawns Claude CLI with stream-json mode
types/
└── strudel.d.ts               # Strudel module declarations
```

**Architecture (Dual WebSocket):**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Browser                                                                      │
│  ┌──────────────────┐         ┌──────────────────────────────────────────┐  │
│  │ Terminal Panel   │         │ Strudel Panel                            │  │
│  │ (useClaudeTerminal)        │ (useStrudel + useWebSocket)              │  │
│  └────────┬─────────┘         └────────────────────┬─────────────────────┘  │
└───────────│────────────────────────────────────────│────────────────────────┘
            │ WebSocket                              │ WebSocket
            ▼                                        ▼
┌───────────────────────┐              ┌─────────────────────────────────────┐
│ /api/claude-ws        │              │ /api/ws                             │
│ (spawns Claude CLI)   │              │ (broadcasts to MCP server)          │
└───────────┬───────────┘              └──────────────────┬──────────────────┘
            │ stdin/stdout (stream-json)                  │ WebSocket
            ▼                                             ▼
┌───────────────────────┐              ┌─────────────────────────────────────┐
│ Claude CLI            │              │ MCP Server (packages/mcp-server)    │
│ --input-format        │──────────────│ execute_pattern, stop_pattern, etc. │
│   stream-json         │  MCP tools   └─────────────────────────────────────┘
└───────────────────────┘
```

**Two Communication Channels:**
1. **Claude Terminal** (`/api/claude-ws`) - Spawns Claude CLI process with stream-json mode for interactive chat
2. **Strudel MCP Bridge** (`/api/ws`) - WebSocket bridge for MCP server tool calls (execute_pattern, stop_pattern)

**Important:** This project uses **Claude Code** (the CLI tool) in two ways:
- Directly via the Terminal Panel (spawned by the web server)
- Via MCP server for tool execution (configured in `mcp-config.json`)

Message flow:
- Terminal → Claude CLI: User messages via stdin (stream-json format)
- Claude CLI → Terminal: Responses via stdout (stream-json format)
- Claude → Strudel: MCP tool calls via WebSocket bridge

**Key Code - app/api/ws/route.ts (using next-ws):**
```typescript
import type { WebSocket, WebSocketServer } from 'ws';
import type { IncomingMessage } from 'http';

export function SOCKET(
  client: WebSocket,
  _request: IncomingMessage,
  server: WebSocketServer
) {
  client.on('message', (data) => {
    const message = JSON.parse(data.toString());
    // Broadcast to all OTHER clients
    server.clients.forEach((c) => {
      if (c !== client && c.readyState === 1) {
        c.send(JSON.stringify(message));
      }
    });
  });
}
```

**Key Code - page.tsx:**
```tsx
'use client';
import dynamic from 'next/dynamic';

// Dynamic import for SSR compatibility
const StrudelPanel = dynamic(() => import('@/components/StrudelPanel'), { ssr: false });

export default function Home() {
  const { ref, setCode, evaluate, stop } = useStrudel();
  const { isConnected, sendMessage, error } = useWebSocket({
    onExecute: (code) => { setCode(code); evaluate(true); },
    onStop: () => stop(),
    onMessage: (msg) => setMessages(prev => [...prev, msg]),
  });

  // Keyboard shortcuts: Ctrl+Enter to play, Ctrl+. to stop
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'Enter') handlePlay();
        else if (e.key === '.') handleStop();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <main className="flex min-h-screen">
      <ChatPanel messages={messages} onSendMessage={sendMessage} />
      <div className="flex-1">
        {error && <ErrorBanner error={error} />}
        <StrudelPanel ref={ref} />
        {!audioReady && <AudioStartButton />}
      </div>
    </main>
  );
}
```

**Additional Features Implemented:**
- Keyboard shortcuts (Ctrl+Enter to play, Ctrl+. to stop)
- 5-second WebSocket connection timeout with error handling
- Strudel syntax error display in UI (via `update` event)
- CSS customizations hiding default Strudel full-screen visualizations
- Dynamic component loading for SSR compatibility

**Verification (MVP Complete):**
1. `npm run dev` → app at localhost:3000
2. Click "Start Audio"
3. Start Claude Code: `claude`
4. Ask: "Play a simple beat"
5. Claude uses `execute_pattern` → audio plays
6. Claude uses `send_message` → explanation appears in chat
7. User types in chat → Claude can read via `get_user_messages`

---

## Optional Phases (Build Only If Needed)

### Optional: Pattern Persistence
Add Prisma + SQLite only if saving patterns becomes essential.

### Optional: Session Management
Add session tracking only if conversation continuity is needed.

### Optional: Audio Recording
Add MediaRecorder integration only if exporting audio is needed.

### Optional: Learning Features
Add curriculum/progress only if structured learning is needed.

---

## Critical Technical Notes

1. **No API Keys**: This project uses Claude Code (CLI) directly, not the Anthropic API. Claude Code auto-discovers the MCP server from `.mcp.json`
2. **Strudel SSR**: Must use `'use client'` + dynamic imports
3. **Audio Context**: Requires user gesture (AudioStartButton)
4. **WebSocket**: Use `next-ws` package with `SOCKET` export (not `UPGRADE`). Requires `npx next-ws-cli@latest patch` after install.
5. **AGPL License**: Strudel is AGPL - project must be open source
6. **Connection Timeout**: 5-second timeout prevents hanging on connection issues
7. **Strudel Visualizations**: Hidden via CSS to prevent full-screen canvas overlays
8. **Claude CLI Stream-JSON Format**: User messages must be `{type:'user',message:{role:'user',content:text}}` (not just `{type:'user',content:text}`)
9. **React StrictMode WebSocket**: Add delay before spawning processes to survive StrictMode's mount/unmount/remount cycle
10. **useCallback Dependencies**: Avoid putting state in WebSocket callback deps - use refs to prevent reconnection loops

---

## Verification (End-to-End MVP)

1. Start app: `npm run dev`
2. Open: http://localhost:3000
3. Click "Start Audio"
4. In another terminal: `claude` (from project root)
5. Tell Claude: "Teach me the basics of Strudel patterns"
6. Expected:
   - Claude reads `strudel://reference` resource
   - Claude sends explanations via `send_message` → appears in left panel
   - Claude executes patterns via `execute_pattern` → plays in right panel
   - Claude can stop with `stop_pattern`
   - User can reply in chat, Claude reads via `get_user_messages`

---

## File Count Comparison

| Approach | Files | Lines |
|----------|-------|-------|
| Original 8-phase plan | 50+ | 3000+ |
| MVP plan (estimated) | ~15 | 500-800 |
| **Actual implementation** | **~15** | **~1,150** (excl. reference doc) |
| strudel-mcp-bridge | ~5 | 336 |

**Breakdown of actual lines:**
- Web app (app/, components/, hooks/, lib/, types/): ~900 lines
- MCP server (packages/mcp-server/src/): ~250 lines (excl. 320-line reference doc)

The implementation stayed close to the MVP target while adding essential features like bidirectional chat, keyboard shortcuts, and error handling.

---

## Sources
- [strudel-mcp-bridge](https://github.com/phildougherty/strudel-mcp-bridge) - Minimal bridge approach
- [strudel-mcp-server](https://github.com/williamzujkowski/strudel-mcp-server) - Full-featured reference
- [Strudel Integration Docs](https://strudel.cc/technical-manual/project-start/)
