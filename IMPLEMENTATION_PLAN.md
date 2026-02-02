# CC Sick Beats - Implementation Plan

A web app connecting Claude Code to Strudel.cc for AI-assisted live coding music.

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
- MCP server with 3 essential tools
- WebSocket bridge
- Embedded Strudel reference

### Optional (Back Burner)
- Pattern persistence (database)
- Session management
- Audio recording
- Learning/progress tracking
- Curriculum resource

---

## MVP Phase 1: Foundation + Strudel Test

**Goal:** Next.js app that loads Strudel and plays audio.

**Files:**
```
cc_sick_beats/
├── package.json                # Simple npm project (NO monorepo initially)
├── tsconfig.json
├── next.config.js
├── tailwind.config.ts
├── postcss.config.js
├── .gitignore
├── app/
│   ├── layout.tsx
│   ├── page.tsx               # Split pane placeholder
│   └── globals.css
└── components/
    └── StrudelEditor.tsx      # 'use client' component
```

**Why no monorepo?** Start simple. Add Turborepo later if needed.

**Key Code - StrudelEditor.tsx:**
```tsx
'use client';
import { useEffect, useRef } from 'react';

export default function StrudelEditor() {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<any>(null);

  useEffect(() => {
    const init = async () => {
      if (!containerRef.current || editorRef.current) return;
      const { StrudelMirror } = await import('@strudel/repl');
      editorRef.current = new StrudelMirror({
        root: containerRef.current,
        initialCode: 'sound("bd sd")',
      });
    };
    init();
  }, []);

  return <div ref={containerRef} className="h-full" />;
}
```

**Verification:**
1. `npm install && npm run dev`
2. Strudel editor renders
3. Click play → audio works

---

## MVP Phase 2: MCP Server (Thin Bridge)

**Goal:** MCP server Claude Code can connect to, with 3 tools.

**Files:**
```
packages/mcp-server/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts               # Server entry
│   └── strudel-reference.ts   # Embedded API docs
└── dist/                      # Compiled output
.claude/settings.local.json
```

**Tools (3 total):**
1. `execute_pattern(code)` - Send code to web app
2. `stop_pattern()` - Stop playback
3. `send_message(text)` - Send explanation to chat

**Resource (1 total):**
- `strudel://reference` - Embedded Strudel API documentation

**Key Code - index.ts:**
```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import WebSocket from 'ws';

const WS_URL = process.env.WS_URL || 'ws://localhost:3000/api/ws';
let ws: WebSocket | null = null;

function connect() {
  ws = new WebSocket(WS_URL);
  ws.on('close', () => setTimeout(connect, 2000));
}
connect();

function send(type: string, payload: any) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, payload }));
  }
}

const server = new Server({ name: 'strudel', version: '1.0.0' }, {
  capabilities: { tools: {}, resources: {} }
});

// Tool: execute_pattern
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name === 'execute_pattern') {
    send('execute', { code: req.params.arguments.code });
    return { content: [{ type: 'text', text: 'Pattern sent' }] };
  }
  // ... other tools
});

// Resource: strudel://reference
server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  if (req.params.uri === 'strudel://reference') {
    return { contents: [{ uri: req.params.uri, text: STRUDEL_REFERENCE }] };
  }
});

new StdioServerTransport().connect(server);
```

**.claude/settings.local.json:**
```json
{
  "mcpServers": {
    "strudel": {
      "command": "node",
      "args": ["./packages/mcp-server/dist/index.js"],
      "env": { "WS_URL": "ws://localhost:3000/api/ws" }
    }
  }
}
```

**Verification:**
1. `cd packages/mcp-server && npm run build`
2. Test with MCP Inspector: `npx @modelcontextprotocol/inspector`
3. Tools appear, resource readable
4. Start Claude Code in project → MCP server recognized

---

## MVP Phase 3: Web App + WebSocket Bridge

**Goal:** Working split-panel app that receives MCP commands.

**Files to Add:**
```
app/
├── page.tsx                   # Split pane layout
└── api/ws/route.ts            # WebSocket endpoint
components/
├── ChatPanel.tsx              # Left panel
├── StrudelPanel.tsx           # Right panel (wraps StrudelEditor)
└── AudioStartButton.tsx       # Browser audio unlock
hooks/
├── useWebSocket.ts
└── useStrudel.ts              # setCode, evaluate, stop
lib/
└── types.ts
```

**Architecture (Simple):**
```
Claude Code → MCP Server → WebSocket → Browser → Strudel
                                    → Chat Panel
```

**Key Code - app/api/ws/route.ts (using next-ws):**
```typescript
const clients = new Set<WebSocket>();

export function UPGRADE(client: WebSocket) {
  clients.add(client);

  client.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    // Broadcast to all browser clients
    clients.forEach(c => {
      if (c !== client && c.readyState === 1) {
        c.send(JSON.stringify(msg));
      }
    });
  });

  client.on('close', () => clients.delete(client));
}
```

**Key Code - page.tsx:**
```tsx
'use client';
import { useState, useCallback } from 'react';
import ChatPanel from '@/components/ChatPanel';
import StrudelPanel from '@/components/StrudelPanel';
import AudioStartButton from '@/components/AudioStartButton';
import { useWebSocket } from '@/hooks/useWebSocket';

export default function Home() {
  const [messages, setMessages] = useState([]);
  const [audioStarted, setAudioStarted] = useState(false);
  const strudelRef = useRef(null);

  const handleMessage = useCallback((msg) => {
    if (msg.type === 'execute') {
      strudelRef.current?.setCode(msg.payload.code);
      strudelRef.current?.evaluate();
    } else if (msg.type === 'message') {
      setMessages(prev => [...prev, msg.payload]);
    } else if (msg.type === 'stop') {
      strudelRef.current?.stop();
    }
  }, []);

  const { isConnected } = useWebSocket(handleMessage);

  return (
    <>
      {!audioStarted && <AudioStartButton onStart={() => setAudioStarted(true)} />}
      <div className="flex h-screen">
        <ChatPanel messages={messages} isConnected={isConnected} />
        <StrudelPanel ref={strudelRef} />
      </div>
    </>
  );
}
```

**Verification (MVP Complete):**
1. `npm run dev` → app at localhost:3000
2. Click "Start Audio"
3. Start Claude Code: `claude`
4. Ask: "Play a simple beat"
5. Claude uses `execute_pattern` → audio plays
6. Claude uses `send_message` → explanation appears in chat

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

1. **Strudel SSR**: Must use `'use client'` + dynamic imports
2. **Audio Context**: Requires user gesture (AudioStartButton)
3. **WebSocket**: Use `next-ws` package, requires `next-ws patch` in postinstall
4. **AGPL License**: Strudel is AGPL - project must be open source

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

---

## File Count Comparison

| Approach | Files | Lines (est) |
|----------|-------|-------------|
| Original 8-phase plan | 50+ | 3000+ |
| MVP plan | ~15 | 500-800 |
| strudel-mcp-bridge | ~5 | 336 |

**Goal: Stay closer to 500-800 lines for MVP.**

---

## Sources
- [strudel-mcp-bridge](https://github.com/phildougherty/strudel-mcp-bridge) - Minimal bridge approach
- [strudel-mcp-server](https://github.com/williamzujkowski/strudel-mcp-server) - Full-featured reference
- [Strudel Integration Docs](https://strudel.cc/technical-manual/project-start/)
