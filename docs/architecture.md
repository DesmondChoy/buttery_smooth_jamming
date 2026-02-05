# Architecture

## System Overview

CC Sick Beats uses a dual WebSocket architecture to connect Claude Code with the Strudel live coding environment.

## Architecture Diagram

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

## Two Communication Channels

### 1. Claude Terminal (`/api/claude-ws`)
- Spawns Claude CLI process with stream-json mode
- Handles interactive chat between user and Claude
- Messages flow via stdin/stdout

### 2. Strudel MCP Bridge (`/api/ws`)
- WebSocket bridge for MCP server tool calls
- Tools: `execute_pattern`, `stop_pattern`, `send_message`, `get_user_messages`
- Broadcasts messages to all connected clients

## Message Flow

```
Terminal → Claude CLI: User messages via stdin (stream-json format)
Claude CLI → Terminal: Responses via stdout (stream-json format)
Claude → Strudel:      MCP tool calls via WebSocket bridge
```

## File Structure

```
cc_sick_beats/
├── app/
│   ├── page.tsx                   # Split pane layout with keyboard shortcuts
│   ├── layout.tsx
│   ├── globals.css                # Tailwind + Strudel visualization hiding
│   └── api/
│       ├── ws/route.ts            # WebSocket for Strudel MCP bridge
│       └── claude-ws/route.ts     # WebSocket for Claude Terminal integration
├── components/
│   ├── TerminalPanel.tsx          # Left panel - Claude Terminal with chat
│   ├── StrudelPanel.tsx           # Right panel (wraps StrudelEditor)
│   ├── StrudelEditor.tsx          # Strudel web component wrapper
│   └── AudioStartButton.tsx       # Browser audio unlock
├── hooks/
│   ├── index.ts                   # Exports
│   ├── useWebSocket.ts            # Strudel MCP WebSocket connection
│   ├── useClaudeTerminal.ts       # Claude Terminal WebSocket + message handling
│   └── useStrudel.ts              # setCode, evaluate, stop
├── lib/
│   ├── types.ts                   # TypeScript types for messages
│   └── claude-process.ts          # Spawns Claude CLI with stream-json mode
├── types/
│   └── strudel.d.ts               # Strudel module declarations
├── packages/mcp-server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts               # Server entry
│   │   └── strudel-reference.ts   # Embedded API docs
│   └── build/                     # Compiled output
├── .mcp.json                      # MCP configuration at project root
└── docs/                          # This documentation
```

## Component Relationships

| Component | Responsibility | Dependencies |
|-----------|----------------|--------------|
| `page.tsx` | Layout, keyboard shortcuts | All panels |
| `TerminalPanel` | Chat UI, Claude interaction | `useClaudeTerminal` |
| `StrudelPanel` | Audio visualization | `StrudelEditor`, `useStrudel` |
| `useWebSocket` | MCP bridge connection | WebSocket API |
| `useClaudeTerminal` | Claude CLI streaming | WebSocket API |
| `useStrudel` | Strudel editor control | Strudel web component |
| MCP Server | Tool execution | WebSocket client |

## Key Design Decisions

1. **Dual WebSocket vs Single**: Separating concerns allows Claude Terminal and MCP tools to operate independently
2. **next-ws Package**: Enables WebSocket routes in Next.js App Router
3. **stream-json Format**: Claude CLI's native streaming format for real-time responses
4. **Dynamic Imports**: Required for Strudel's browser-only code with Next.js SSR
