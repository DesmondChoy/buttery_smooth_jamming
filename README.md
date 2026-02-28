# Buttery Smooth Jamming

An autonomous AI jam session where band member agents play together in real-time, react to each other's music, and respond to a human "boss" directing the session — all powered by Codex and [Strudel](https://strudel.cc).

## The Band

| Agent | Role | Personality |
|-------|------|-------------|
| 🥁 BEAT | Drums | Syncopation-obsessed, provides the rhythmic foundation |
| 🎸 GROOVE | Bass | Selfless minimalist who locks in with the kick drum |
| 🎹 ARIA | Melody | Classically trained, insists on harmonic correctness |
| 🎼 CHORDS | Chords / Comping | Comping specialist, fills the harmonic middle |

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

1. Click **Ready to Jam?** to unlock browser audio
2. Click **Start a Jam Session** and select your agents
3. The jam starts in **staged-silent mode** — no sound yet
4. Activate agents with `@mention` directives like `"@BEAT lay down a groove"` or `"@CHORDS add offbeat comping stabs"`
5. Once at least one agent is playing, use broadcast directives like `"More energy!"` to steer the whole band
6. **Mute/unmute** individual agents from their column headers
7. Click **Stop** to end the session

Between directives, agents autonomously evolve every 30 seconds and can collectively propose key changes, chord progressions, and tempo/energy shifts via consensus.

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
├── hooks/                        # useJamSession, useRuntimeTerminal, useStrudel
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
Recent runtime reliability updates (start/connect sequencing, reconnect behavior, and session lifecycle shutdown semantics) are documented in:

- [V3 Model Policy Boundary](./docs/v3/model-policy-boundary.md)
- [V3 Model-Policy Playbook](./docs/v3/model-policy-playbook.md)

Additional sensory-control behavior now in this codebase is documented under:

- [V3 Runtime Sensory & Conductor Boundaries](./docs/v3/model-policy-boundary.md#audio-and-vision-context-boundaries)
- [V3 Model-Policy Playbook (Failure Triage)](./docs/v3/model-policy-playbook.md#3-failure-triage)

## License

AGPL-3.0 — required by the [Strudel](https://strudel.cc) dependency.
