# V2: Autonomous Jam Session

An **autonomous AI jam session** where 4 band member agents (drums, bass, melody, FX) play together in real-time via Strudel, react to each other, and respond to a human "boss" directing the session.

## Status: Baseline Reference

This v2 documentation set is preserved as historical baseline context while v3
is the active architecture path.

## Documentation Map

| Document | Purpose |
|----------|---------|
| [Architecture](./architecture.md) | System design, diagrams, file structure |
| [Technical Notes](./technical-notes.md) | Critical gotchas for debugging |
| [Model Policy Boundary (V3 canonical)](../v3/model-policy-boundary.md) | Current policy source of truth for model-owned autonomy vs code-owned guarantees |
| [Implementation Plan](./implementation-plan.md) | Historical design doc: phases 1-6 + v1-to-v2 evolution |

## Quick Start

```bash
# Install dependencies
npm install

# Build the MCP server (required on first run and after editing MCP source)
cd packages/mcp-server && npm run build && cd ../..

# Start the web app
npm run dev
```

1. Open http://localhost:3000
2. Click **Start Audio** to unlock the browser audio context
3. Click **Start Jam** in the top bar
4. Select which agents to include (drums, bass, melody, FX)
5. Confirm — agents spawn and begin playing
6. Type directives in the boss input bar (e.g., "More energy!", "@BEAT double time")
7. Click **Stop** to end the session

## Band Members

| Agent | Emoji | Personality |
|-------|-------|-------------|
| BEAT | 🥁 | Syncopation-obsessed veteran drummer, high ego |
| GROOVE | 🎸 | Selfless minimalist bassist, locks in with kick drum |
| ARIA | 🎹 | Classically trained melodist, insists on harmonic correctness |
| GLITCH | 🎛️ | Chaotic texture artist, lives to break sonic conventions |

## Boss Directives

- **Broadcast**: Type without `@` — directive goes to all active agents
- **Targeted**: Use `@BEAT`, `@GROOVE`, `@ARIA`, or `@GLITCH` — directive goes to that agent only
- **Musical context**: "Switch to D major", "BPM 140", "More energy!" — agents adjust their patterns

## Key Design Decisions

1. **Per-agent Codex-backed sessions** — each agent maintains isolated Codex conversation state (`thread_id`) across turns, avoiding the 22-29s latency of spawning fresh subagents per directive
2. **Deterministic routing** — `@BEAT` routes to the drums session via code, no LLM inference needed
3. **Server-side pattern composition** — `composePatterns()` builds `stack()` in TypeScript, not LLM reasoning
4. **Broadcast callback pattern** — route handler passes a closure to the process manager, avoiding `ws` native addon issues in Next.js webpack
5. **No MCP tools for jam agents** — the `jam_agent` Codex profile disables MCP/tool access for jam workers

## Latency Tracking

| Scenario | Latest value | Measured on | Method | Notes |
|----------|--------------|-------------|--------|-------|
| v1 orchestrator, targeted directive | 22-29s | 2026-02-09 | Server `[TIMING]` logs captured in the implementation history | Historical baseline |
| v2 persistent processes, targeted directive | 5.3s | 2026-02-09 | Server `[TIMING]` logs captured in the implementation history | Historical baseline |
| v2 persistent processes, broadcast directive | 7.0s | 2026-02-09 | Server `[TIMING]` logs captured in the implementation history | Historical baseline |
| v2 current runtime (Codex jam_agent profile) | Pending re-benchmark | 2026-02-24 | Attempted headless CLI probe in this sandbox; unable to capture reliable end-to-end jam timing | Re-run manually on a full local jam session before publishing new SLA claims |

Current documented values are historical unless explicitly tagged with a newer measurement date/method.
