# Buttery Smooth Jamming

An autonomous AI jam session where band member agents play together in real-time, react to each other's music, and respond to a human "boss" directing the session — all powered by Codex and [Strudel](https://strudel.cc).

## The Band

| Agent | Role | Personality |
|-------|------|-------------|
| 🥁 BEAT | Drums | Syncopation-obsessed veteran, high ego |
| 🎸 GROOVE | Bass | Selfless minimalist, locks in with the kick |
| 🎹 ARIA | Melody | Classically trained, insists on harmonic correctness |
| 🎼 CHORDS | Chords / Comping | Audible harmonic middle layer, comping and supportive texture |

Each agent runs in a persistent Codex-backed session with its own personality, musical memory, and opinions. They share a musical context (key, scale, BPM, chords) for harmonic coherence and follow boss directives faithfully. Between directives, agents autonomously evolve their patterns every 30 seconds and can collectively suggest key changes, chord progressions, and tempo/energy shifts.

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
3. Choose a jam preset and click **▶ Play** (jam starts in staged-silent mode)
4. Activate the band with an `@mention` directive like `"@CHORDS add offbeat comping stabs"` or `"@BEAT double time"`
5. Type broadcast directives like `"More energy!"` once at least one agent has joined
6. Click **Stop** to end the session

Outside of jam mode, the app also works as a Strudel assistant — chat with the Codex runtime to learn and explore live coding patterns.

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
  │   🥁 BEAT session (jam_agent) Persistent Codex-backed session
  │     │
  │     ▼
  │   { pattern, thoughts,        Agent responds with JSON
  │     commentary }
  │     │
  │     ▼
  │   stack(drums, bass,           Server composes patterns in TypeScript
  │         melody, chords)
  │     │
  │     ▼
  └── Browser plays music          Strudel evaluates the composed pattern

Auto-tick (every 30s)
  │
  ▼
All agents receive band state      Autonomous evolution prompt
  │
  ▼
Agents respond + decision block    May suggest key/chord/tempo changes
  │
  ▼
Consensus check                    2+ agents agree on key → applied
  │
  ▼
Context updates broadcast          All agents see updated context
```

Each agent keeps full conversational memory across the jam session. Directive-to-music latency is **5-7 seconds**.

## Project Structure

```
buttery_smooth_jamming/
├── app/                          # Next.js app (pages + API routes)
├── components/                   # UI: JamTopBar, AgentColumn, BossInputBar, etc.
├── hooks/                        # useJamSession, useAiTerminal, useStrudel
├── lib/                          # agent-process-manager, codex-process, types
├── .codex/agents/                # Band member personas (drummer.md, bassist.md, etc.)
├── .codex/skills/                # Project-local Codex skills
├── packages/mcp-server/          # MCP server (Strudel bridge + jam state)
└── docs/                         # Documentation (v1-mvp/, v2-jam-session/, v3/)
```

## Requirements

- [Node.js](https://nodejs.org/) 18+
- Codex CLI with an active account/session
- A modern browser with audio support

## Documentation

See [docs/](./docs/README.md) for architecture, technical notes, and the full implementation story.

## License

AGPL-3.0 — required by the [Strudel](https://strudel.cc) dependency.
