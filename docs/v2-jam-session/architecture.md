# V2 Architecture

## System Overview

Buttery Smooth Jamming v2 uses a **dual-mode architecture**: a single-agent Strudel assistant for normal interactions, and per-agent Codex-backed sessions for jam sessions.

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
│ /api/ai-ws              │              │ /api/ws                              │
│                         │              │ (MCP bridge — broadcasts to browser) │
│ Normal mode:            │              └──────────────────┬───────────────────┘
│   RuntimeProcess        │                                 │ WebSocket
│   (Codex default)       │                                 ▼
│                         │              ┌──────────────────────────────────────┐
│ Jam mode:               │              │ MCP Server (packages/mcp-server)     │
│   AgentProcessManager   │              │ execute_pattern, stop_pattern,       │
│   ┌───────────────────┐ │              │ send_message, get_user_messages      │
│   │ Codex jam session │ │              └──────────────────────────────────────┘
│   │ drums thread_id   │ │
│   ├───────────────────┤ │
│   │ bass thread_id    │ │
│   ├───────────────────┤ │
│   │ melody thread_id  │ │
│   ├───────────────────┤ │
│   │ fx thread_id      │ │
│   └───────────────────┘ │
│                         │
│ Broadcast callback ─────│──→ client.send() on the /api/ai-ws WebSocket
└─────────────────────────┘
```

## Two Modes of Operation

### Normal Mode (Strudel Assistant)
- `createNormalRuntimeProcess()` chooses the configured runtime provider (Codex by default)
- User chats via TerminalPanel, runtime generates Strudel patterns via MCP tools
- Standard MCP tool flow: runtime process → MCP server → `/api/ws` → browser

### Jam Mode (Per-Agent Persistent Sessions)
- `AgentProcessManager` prepares one Codex-backed session per active agent, keyed by `thread_id`
- Boss directives route deterministically to the targeted agent session
- Agents respond with JSON: `{ pattern, thoughts, reaction }`
- Manager composes `stack()` pattern and broadcasts via callback closure
- `AgentProcessManager` is the canonical jam-state source in v2 (round, context, per-agent status/pattern)
- The normal-mode runtime process is **bypassed** during jams

## Message Flow

### Jam Start
```
Browser → { type: 'start_jam', activeAgents: ['drums','bass','melody','fx'] }
  → ai-ws creates AgentProcessManager with broadcast callback
    → Manager prepares 4 Codex-backed sessions (parallel)
      → Each agent receives initial jam context
        → Agents respond with JSON
          → Manager composes stack(), broadcasts state → Browser
```

### Boss Directive
```
BossInputBar → { type: 'boss_directive', text: '@BEAT double time', targetAgent: 'drums' }
  → Manager routes to drums session only (deterministic)
    → Drums responds with updated JSON
      → Manager recomposes stack() with updated pattern
        → Broadcasts agent_thought, agent_status, execute → Browser
```

### Stop Jam
```
Browser → { type: 'stop_jam' }
  → Manager stops any in-flight jam turns and clears agent sessions
    → UI returns to normal mode
```

## File Structure

> **Keeping this tree current:** When adding or removing files listed here,
> update this tree in the same PR. Run `ls -R` against changed sections to verify.

```
buttery_smooth_jamming/
├── app/
│   ├── page.tsx                     # Dual layout: normal mode + jam mode
│   ├── layout.tsx
│   ├── globals.css                  # Tailwind + Strudel visualization hiding
│   └── api/
│       ├── ws/route.ts              # WebSocket for Strudel MCP bridge
│       ├── ai-ws/route.ts           # Primary provider-neutral runtime WebSocket path
│       ├── runtime-ws/route.ts      # Runtime WebSocket + jam routing (legacy path alias target)
│       └── claude-ws/route.ts       # Legacy compatibility alias to runtime-ws
├── components/
│   ├── TerminalPanel.tsx            # Chat panel (normal mode)
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
│   ├── useRuntimeTerminal.ts        # Runtime WS + jam broadcast forwarding (base implementation)
│   ├── useAiTerminal.ts             # Provider-neutral hook alias (preferred for new imports)
│   ├── useClaudeTerminal.ts         # Compatibility hook alias
│   ├── useJamSession.ts             # Jam state management + agent selection
│   └── useStrudel.ts                # setCode, evaluate, stop
├── lib/
│   ├── types.ts                     # Shared types (AGENT_META, JamState, WSMessage)
│   ├── claude-process.ts            # Spawns Claude CLI (Strudel assistant only)
│   ├── agent-process-manager.ts     # Per-agent Codex-backed sessions (jam mode)
│   ├── pattern-parser.ts            # Parses Strudel patterns into structured summaries
│   ├── musical-context-parser.ts    # Parses key/BPM/energy from boss directives
│   ├── agent-status-ui.ts           # Status label/color mapping for jam agent UI
│   ├── jam-admission.ts             # Jam admission/concurrency limit decisions
│   ├── jam-agent-shared-policy.ts   # Shared policy prompt for all jam agents
│   ├── genre-energy-guidance.ts     # Genre-aware energy guidance builder
│   ├── musical-context-presets.ts   # Randomized starting contexts for jam sessions
│   ├── codex-runtime-checks.ts     # Codex binary/auth/profile startup validation
│   ├── runtime-factory.ts           # Runtime selection (Codex/provider-neutral)
│   ├── strudel-reference.md         # Strudel API reference injected into agent prompts
│   └── __tests__/
│       ├── pattern-parser.test.ts          # Pattern parser unit tests
│       ├── musical-context-parser.test.ts  # Musical context parser tests
│       ├── agent-process-manager.test.ts   # Agent process manager tests
│       ├── agent-meta-consistency.test.ts  # AGENT_META ↔ agent file consistency
│       ├── agent-status-ui.test.ts         # Status mapping coverage (idle/thinking/playing/error/timeout)
│       └── jam-admission.test.ts           # Concurrency limit admission tests
├── .codex/agents/
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
| `TerminalPanel` | Chat UI, runtime interaction | Normal |
| `StrudelPanel` | Audio visualization + editor | Normal |
| `JamTopBar` | Start/stop jam, musical context display | Jam |
| `AgentColumn` | Per-agent status, thoughts, pattern preview | Jam |
| `AgentSelectionModal` | Pre-jam agent picker | Jam |
| `BossInputBar` | Directive input with @mention parsing | Jam |
| `PatternDisplay` | Shows per-agent pattern rows (collapsible) | Jam |
| `useJamSession` | Jam state, agent selection, directive routing | Jam |
| `useAiTerminal` / `useRuntimeTerminal` | Runtime streaming + jam broadcast forwarding | Both |
| `AgentProcessManager` | Manages per-agent Codex-backed jam sessions | Jam (server) |
| `CodexProcess`/`ClaudeProcess` | Normal-mode runtime implementation | Normal (server) |
| `musical-context-parser.ts` | Deterministic key/BPM/energy/chord parsing from directives | Jam (server) |
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

// lib/types.ts — Structured musical decisions (bsj-bx1)
interface StructuredMusicalDecision {
  tempo_delta_pct?: number;    // -50..50
  energy_delta?: number;       // -3..3
  arrangement_intent?: 'build' | 'breakdown' | 'drop' | 'strip_back'
                      | 'bring_forward' | 'hold' | 'no_change' | 'transition';
  confidence?: 'low' | 'medium' | 'high';
  suggested_key?: string;      // e.g. "Eb major"
  suggested_chords?: string[]; // e.g. ["Am", "F", "C", "G"]
}
```

## Latency

v2 persistent sessions are significantly faster than v1's orchestrator approach:

- **v1 (Orchestrator):** 22-35s per directive — each directive spawned fresh subagents
- **v2 (Persistent Sessions):** Seconds, not tens of seconds — agent state persists for the entire jam

Default jam model is sourced from the Codex `jam_agent` profile (`config/codex/config.toml`). Latency varies by model choice.

See [Implementation Plan: Architecture Evolution](./implementation-plan.md#architecture-evolution-orchestrator-v1--per-agent-persistent-processes-v2) for the full v1-to-v2 migration story.

## Model-Policy Architecture

For system prompt assembly, directive processing flow, governance constants, and
operator triage, see the [Model-Policy Playbook](../v3/model-policy-playbook.md).

The canonical boundary definition is at [Model Policy Boundary](../v3/model-policy-boundary.md).
