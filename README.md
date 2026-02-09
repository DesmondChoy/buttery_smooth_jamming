# CC Sick Beats

An autonomous AI jam session where band member agents play together in real-time, react to each other's music, and respond to a human "boss" directing the session — all powered by Claude and [Strudel](https://strudel.cc).

## The Band

| Agent | Role | Personality |
|-------|------|-------------|
| 🥁 BEAT | Drums | Syncopation-obsessed veteran, high ego |
| 🎸 GROOVE | Bass | Selfless minimalist, locks in with the kick |
| 🎹 ARIA | Melody | Classically trained, insists on harmonic correctness |
| 🎛️ GLITCH | FX | Chaotic texture artist, lives to break conventions |

Each agent is a persistent Claude process with its own personality, musical memory, and opinions. They share a musical context (key, scale, BPM, chords) for harmonic coherence but may disagree with the boss in their own way.

## Quick Start

```bash
# Install dependencies
npm install

# Build the MCP server
cd packages/mcp-server && npm run build && cd ../..

# Start the web app
npm run dev
```

Then open http://localhost:3000:

1. Click **Start Audio** to unlock browser audio
2. Click **Start Jam** and select your agents
3. Type directives: `"More energy!"` or target an agent: `"@BEAT double time"`
4. Click **Stop** to end the session

Outside of jam mode, the app also works as a Strudel assistant — chat with Claude to learn and explore live coding patterns.

## How It Works

```
You (the Boss)
  │
  ├─ "@BEAT double time"          Directive with @mention
  │     │
  │     ▼
  │   AgentProcessManager         Deterministic routing (no LLM needed)
  │     │
  │     ▼
  │   🥁 BEAT process (Haiku)     Persistent claude --print process
  │     │
  │     ▼
  │   { pattern, thoughts,        Agent responds with JSON
  │     reaction }
  │     │
  │     ▼
  │   stack(drums, bass,           Server composes patterns in TypeScript
  │         melody, fx)
  │     │
  │     ▼
  └── Browser plays music          Strudel evaluates the composed pattern
```

Each agent keeps full conversational memory across the jam session. Directive-to-music latency is **5-7 seconds**.

## Project Structure

```
cc_sick_beats/
├── app/                          # Next.js app (pages + API routes)
├── components/                   # UI: JamTopBar, AgentColumn, BossInputBar, etc.
├── hooks/                        # useJamSession, useClaudeTerminal, useStrudel
├── lib/                          # agent-process-manager, claude-process, types
├── .claude/agents/               # Band member personas (drummer.md, bassist.md, etc.)
├── packages/mcp-server/          # MCP server (Strudel bridge + jam state)
└── docs/                         # Documentation (v1-mvp/, v2-jam-session/)
```

## Requirements

- [Node.js](https://nodejs.org/) 18+
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) with an active subscription
- A modern browser with audio support

## Documentation

See [docs/](./docs/README.md) for architecture, technical notes, and the full implementation story.

## License

AGPL-3.0 — required by the [Strudel](https://strudel.cc) dependency.
