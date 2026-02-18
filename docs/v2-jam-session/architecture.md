# V2 Architecture

## System Overview

CC Sick Beats v2 uses a **dual-mode architecture**: a single-agent Strudel assistant for normal interactions, and per-agent persistent Claude processes for jam sessions.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Browser                                                                      │
│                                                                              │
│  ┌── JamTopBar ──────────────────────────────────────────────────────────┐  │
│  │ [▶ Start Jam] [⏹ Stop]   Key: C minor  BPM: 120  Energy: 5/10       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌── AgentColumns (CSS grid) ────────────────────────────────────────────┐  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐                 │  │
│  │  │ 🥁 BEAT │  │ 🎸 GROOVE│  │ 🎹 ARIA │  │ 🎛️ GLITCH│                │  │
│  │  │ ● idle  │  │ ◐ think │  │ ● idle  │  │ ● idle  │                 │  │
│  │  │ thought │  │ thought │  │ thought │  │ thought │                 │  │
│  │  │ pattern │  │ pattern │  │ pattern │  │ pattern │                 │  │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘                 │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌── BossInputBar ───────────────────────────────────────────────────────┐  │
│  │ [@BEAT double time...] [Send]                                         │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌── PatternDisplay ─────────────────────────────────────────────────────┐  │
│  │ 🥁 BEAT: s("bd*4").bank("RolandTR909")                               │  │
│  │ 🎸 GROOVE: note("c2 g2").s("sawtooth")                               │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌── Normal Mode ────────────────────────────────────────────────────────┐  │
│  │  TerminalPanel (chat) │ StrudelPanel (editor + audio)                 │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└──────────┬───────────────────────────────────────────┬───────────────────────┘
           │ WebSocket                                 │ WebSocket
           ▼                                           ▼
┌─────────────────────────┐              ┌──────────────────────────────────────┐
│ /api/claude-ws          │              │ /api/ws                              │
│                         │              │ (MCP bridge — broadcasts to browser) │
│ Normal mode:            │              └──────────────────┬───────────────────┘
│   ClaudeProcess         │                                 │ WebSocket
│   (Strudel assistant)   │                                 ▼
│                         │              ┌──────────────────────────────────────┐
│ Jam mode:               │              │ MCP Server (packages/mcp-server)     │
│   AgentProcessManager   │              │ execute_pattern, stop_pattern,       │
│   ┌───────────────────┐ │              │ send_message, get_user_messages      │
│   │ claude --print    │ │              └──────────────────────────────────────┘
│   │ --model sonnet    │ │
│   │ drums process     │ │
│   ├───────────────────┤ │
│   │ bass process      │ │
│   ├───────────────────┤ │
│   │ melody process    │ │
│   ├───────────────────┤ │
│   │ fx process        │ │
│   └───────────────────┘ │
│                         │
│ Broadcast callback ─────│──→ client.send() on the /api/claude-ws WebSocket
└─────────────────────────┘
```

## Two Modes of Operation

### Normal Mode (Strudel Assistant)
- `ClaudeProcess` spawns a single Claude CLI process
- User chats via TerminalPanel, Claude generates Strudel patterns via MCP tools
- Standard MCP tool flow: Claude CLI → MCP server → `/api/ws` → browser

### Jam Mode (Per-Agent Persistent Processes)
- `AgentProcessManager` spawns one `claude --print --model <frontmatter>` per active agent (currently Sonnet, configured in each `.claude/agents/*.md` YAML frontmatter)
- Boss directives route deterministically to agent stdin
- Agents respond with JSON: `{ pattern, thoughts, reaction }`
- Manager composes `stack()` pattern and broadcasts via callback closure
- `AgentProcessManager` is the canonical jam-state source in v2 (round, context, per-agent status/pattern)
- The orchestrator (`ClaudeProcess`) is **bypassed** during jams

## Message Flow

### Jam Start
```
Browser → { type: 'start_jam', activeAgents: ['drums','bass','melody','fx'] }
  → claude-ws creates AgentProcessManager with broadcast callback
    → Manager spawns 4 claude processes (parallel)
      → Each agent receives initial jam context on stdin
        → Agents respond with JSON
          → Manager composes stack(), broadcasts state → Browser
```

### Boss Directive
```
BossInputBar → { type: 'boss_directive', text: '@BEAT double time', targetAgent: 'drums' }
  → Manager routes to drums process stdin only (deterministic)
    → Drums responds with updated JSON
      → Manager recomposes stack() with updated pattern
        → Broadcasts agent_thought, agent_status, execute → Browser
```

### Stop Jam
```
Browser → { type: 'stop_jam' }
  → Manager sends SIGTERM to all agent processes
    → Processes exit, UI returns to normal mode
```

## File Structure

> **Keeping this tree current:** When adding or removing files listed here,
> update this tree in the same PR. Run `ls -R` against changed sections to verify.

```
cc_sick_beats/
├── app/
│   ├── page.tsx                     # Dual layout: normal mode + jam mode
│   ├── layout.tsx
│   ├── globals.css                  # Tailwind + Strudel visualization hiding
│   └── api/
│       ├── ws/route.ts              # WebSocket for Strudel MCP bridge
│       └── claude-ws/route.ts       # WebSocket for Claude Terminal + jam routing
├── components/
│   ├── TerminalPanel.tsx            # Chat panel (normal mode)
│   ├── ChatPanel.tsx                # Chat messages display
│   ├── StrudelPanel.tsx             # Strudel editor wrapper
│   ├── StrudelEditor.tsx            # Strudel web component
│   ├── AudioStartButton.tsx         # Browser audio unlock
│   ├── JamTopBar.tsx                # Jam controls + musical context display
│   ├── JamControls.tsx              # Start/Stop jam buttons
│   ├── AgentColumn.tsx              # Per-agent panel (status, thoughts, pattern)
│   ├── AgentSelectionModal.tsx      # Pre-jam agent picker
│   ├── BossInputBar.tsx             # Directive input with @mention support
│   ├── MentionSuggestions.tsx       # @mention autocomplete dropdown
│   └── PatternDisplay.tsx           # Per-agent pattern viewer
├── hooks/
│   ├── index.ts                     # Exports
│   ├── useWebSocket.ts              # Strudel MCP WebSocket connection
│   ├── useClaudeTerminal.ts         # Claude Terminal WS + jam broadcast forwarding
│   ├── useJamSession.ts             # Jam state management + agent selection
│   └── useStrudel.ts                # setCode, evaluate, stop
├── lib/
│   ├── types.ts                     # Shared types (AGENT_META, JamState, WSMessage)
│   ├── claude-process.ts            # Spawns Claude CLI (Strudel assistant only)
│   ├── agent-process-manager.ts     # Per-agent persistent processes (jam mode)
│   ├── pattern-parser.ts            # Parses Strudel patterns into structured summaries
│   ├── musical-context-parser.ts    # Parses key/BPM/energy from boss directives
│   ├── strudel-reference.md         # Strudel API reference injected into agent prompts
│   └── __tests__/
│       ├── pattern-parser.test.ts          # Pattern parser unit tests
│       ├── musical-context-parser.test.ts  # Musical context parser tests
│       ├── agent-process-manager.test.ts   # Agent process manager tests
│       └── agent-meta-consistency.test.ts  # AGENT_META ↔ agent file consistency
├── .claude/agents/
│   ├── drummer.md                   # 🥁 BEAT persona + Strudel drum patterns
│   ├── bassist.md                   # 🎸 GROOVE persona + bass patterns
│   ├── melody.md                    # 🎹 ARIA persona + melodic patterns
│   └── fx-artist.md                 # 🎛️ GLITCH persona + FX patterns
├── .claude/skills/                  # Claude Code skill definitions (dev tooling)
├── packages/mcp-server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts                 # Server entry + normal-mode MCP tools
│   │   └── strudel-reference.ts     # Embedded API docs (MCP resource)
│   └── build/                       # Compiled output (gitignored)
├── types/
│   └── strudel.d.ts                 # Strudel module declarations
├── AGENTS.md                        # Architecture overview for Codex/agent tools
├── .mcp.json                        # MCP configuration at project root
└── docs/                            # Documentation
```

## Component Relationships

| Component | Responsibility | Mode |
|-----------|----------------|------|
| `page.tsx` | Layout switching (normal ↔ jam), wires broadcast messages | Both |
| `TerminalPanel` | Chat UI, Claude interaction | Normal |
| `StrudelPanel` | Audio visualization + editor | Normal |
| `JamTopBar` | Start/stop jam, musical context display | Jam |
| `AgentColumn` | Per-agent status, thoughts, pattern preview | Jam |
| `AgentSelectionModal` | Pre-jam agent picker | Jam |
| `BossInputBar` | Directive input with @mention parsing | Jam |
| `PatternDisplay` | Shows per-agent pattern rows (collapsible) | Jam |
| `useJamSession` | Jam state, agent selection, directive routing | Jam |
| `useClaudeTerminal` | Claude CLI streaming + jam broadcast forwarding | Both |
| `AgentProcessManager` | Spawns/manages per-agent Claude processes | Jam (server) |
| `ClaudeProcess` | Single Claude CLI for Strudel assistant | Normal (server) |
| MCP Server | Normal-mode tool execution + user message queue | Normal (server) |

## Key Types

```typescript
// lib/types.ts — AGENT_META is the single source of truth
const AGENT_META: Record<string, {
  key: string;
  name: string;
  emoji: string;
  mention: string;
  colors: { border: string; accent: string; bg: string; bgSolid: string };
}> = {
  drums:  { key: 'drums',  name: 'BEAT',   emoji: '🥁', mention: '@BEAT',   colors: { ... } },
  bass:   { key: 'bass',   name: 'GROOVE', emoji: '🎸', mention: '@GROOVE', colors: { ... } },
  melody: { key: 'melody', name: 'ARIA',   emoji: '🎹', mention: '@ARIA',   colors: { ... } },
  fx:     { key: 'fx',     name: 'GLITCH', emoji: '🎛️', mention: '@GLITCH', colors: { ... } },
};
```

## Latency

v2 persistent processes are significantly faster than v1's orchestrator approach:

- **v1 (Orchestrator):** 22-35s per directive — each directive spawned fresh subagents
- **v2 (Persistent Processes):** Seconds, not tens of seconds — agents stay alive for the entire jam

Model is sourced from agent persona YAML frontmatter (currently Sonnet). Latency varies by model choice.

See [Implementation Plan: Architecture Evolution](./implementation-plan.md#architecture-evolution-orchestrator-v1--per-agent-persistent-processes-v2) for the full v1-to-v2 migration story.
