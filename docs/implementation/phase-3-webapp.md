# Phase 3: Web App + WebSocket Bridge ✅

**Goal:** Working split-panel app that receives MCP commands and sends user messages back.

## Files Created/Modified

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

## Dual WebSocket Architecture

**Important:** This project uses **Claude Code** (the CLI tool) in two ways:
1. Directly via the Terminal Panel (spawned by the web server)
2. Via MCP server for tool execution (configured in `.mcp.json`)

See [Architecture](../architecture.md) for the full diagram.

## Key Code: app/api/ws/route.ts

Using `next-ws` for WebSocket support:

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

## Key Code: page.tsx

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

## Additional Features Implemented

| Feature | Description |
|---------|-------------|
| Keyboard shortcuts | Ctrl+Enter to play, Ctrl+. to stop |
| Connection timeout | 5-second WebSocket timeout with error handling |
| Syntax error display | Strudel errors shown in UI via `update` event |
| Hidden visualizations | CSS hides default Strudel full-screen canvas |
| Dynamic loading | SSR-compatible component loading |
| Bidirectional chat | User messages sent to Claude via MCP |

## Dependencies Added

```json
{
  "next-ws": "^1.x"
}
```

**Required setup:**
```bash
npx next-ws-cli@latest patch
```

## Verification Steps (MVP Complete)

1. `npm run dev` → app at localhost:3000
2. Click "Start Audio"
3. Start Claude Code: `claude`
4. Ask: "Play a simple beat"
5. Claude uses `execute_pattern` → audio plays
6. Claude uses `send_message` → explanation appears in chat
7. User types in chat → Claude can read via `get_user_messages`

## Gotchas Discovered

See [Technical Notes](../technical-notes.md) for critical implementation details:
- React StrictMode WebSocket handling (#9)
- useCallback dependency loops (#10)
- Stream-JSON message format (#8)
