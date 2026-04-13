# Buttery Smooth Jamming

Buttery Smooth Jamming is a dual-mode Strudel app built around Codex CLI:

- **Normal assistant mode** offers a Codex-backed Strudel helper through the runtime terminal.
- **Jam mode** runs a four-agent autonomous band with deterministic routing, persistent per-agent sessions, and server-side pattern composition.

The jam surface combines typed boss directives, genre presets, browser audio-feedback summaries, and camera-derived conductor cues while keeping routing, lifecycle, and composition deterministic in code.

## The Band

| Agent | Role | Personality |
|-------|------|-------------|
| 🥁 BEAT | Drums | Syncopation-obsessed, provides the rhythmic foundation |
| 🎸 GROOVE | Bass | Selfless minimalist who locks in with the kick drum |
| 🎹 ARIA | Melody | Classically trained, insists on harmonic correctness |
| 🎼 CHORDS | Chords / Comping | Comping specialist, fills the harmonic middle |

Each agent runs in a persistent `jam_agent` Codex profile, keeps conversational continuity for the full session, and returns structured JSON (`pattern`, `thoughts`, `commentary`, optional musical decisions). The runtime owns deterministic `@mention` routing, jam-state continuity, context consensus rules, and final `stack(...)` composition.

## Quick Start

```bash
# Install dependencies and apply the next-ws patch via the prepare script
npm install

# Build the Strudel MCP server
cd packages/mcp-server && npm run build && cd ../..

# Start the web app
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), then:

1. Click **Start a Jam Session** and choose the agents for this run.
2. Pick a **genre preset** from the top bar. Jam sessions start in **staged-silent** mode, so the preset is applied before anyone joins audibly.
3. Click **Ready to Jam?** to unlock browser audio.
4. Press **Play** to arm the jam.
5. Activate one or more agents with boss directives such as `@BEAT lay down a pocket` or `@CHORDS add offbeat stabs`.
6. Use broadcast directives such as `more energy`, `strip it back`, `BPM 132`, or `switch to Eb major` to steer the full band.
7. Optionally enable **Camera Conductor** once the jam is armed. Camera cues are interpreted into the same directive pipeline and are blocked until at least one agent has been manually activated.
8. Hover or click an agent header to inspect that agent's current context window, recent prompt snapshots, thread lifecycle, and audio-context summary.
9. Click **Stop** to stop playback and tear down the jam session.

Auto-tick evolution runs every **15 seconds** while the jam is active. The countdown appears in the top bar once at least one agent is playing.

## Runtime Surface

### Normal Assistant Mode

- `app/api/ai-ws` is the provider-neutral runtime websocket path used by the terminal drawer.
- Normal-mode Codex runs with the `normal_mode` profile and the Strudel MCP server enabled.
- The terminal streams assistant text, tool-use events, and tool results while the browser evaluates Strudel output through `/api/ws`.

### Jam Mode

- `AgentProcessManager` keeps one long-lived Codex-backed worker per active agent.
- Boss directives route deterministically: `@BEAT`, `@GROOVE`, `@ARIA`, and `@CHORDS` must appear at the beginning of the message for targeted routing.
- Presets are chosen from `lib/musical-context-presets.ts` and lock after the first manual join.
- Audio feedback is sampled from the browser's WebAudio output and summarized into prompt context for all jam turns.
- Camera motion and optional face metrics are interpreted into high-confidence conductor cues before entering the standard directive path.
- Agent context windows are captured by default and surfaced directly in the jam UI for inspection.

## Commands

From the repo root:

```bash
npm run dev               # Start the Next.js app
npm run build             # Production build
npm run start             # Start the production server
npm run lint              # ESLint
npx vitest run            # Unit/integration tests
npm run test:e2e          # Playwright suite
npm run test:e2e:headed   # Playwright with a visible browser
npm run benchmark:workstream-g -- --jam-start-runs 2 --targeted-runs 2 --broadcast-runs 2
```

For the MCP server:

```bash
cd packages/mcp-server
npm run build
npm run dev
npm run start
```

The benchmark script targets `ws://localhost:3000/api/ai-ws` by default and supports `--url`, `--timeout-ms`, `--jam-start-runs`, `--targeted-runs`, `--broadcast-runs`, and `--output-dir`.

## Configuration

- Preferred Codex config path: `.codex/config.toml`
- Repository fallback path: `config/codex/config.toml`
- Required profiles: `normal_mode` and `jam_agent`
- Normal mode keeps the Strudel MCP server enabled.
- Jam agents run toolless with strict MCP isolation.

The bundled fallback config currently uses `gpt-5-codex` for `normal_mode` and `gpt-5-codex-mini` for `jam_agent`, with low reasoning effort and detailed reasoning summaries for both profiles.

## Project Structure

```text
buttery_smooth_jamming/
├── app/                     # Next.js app + websocket/HTTP routes
├── components/              # Jam UI, terminal drawer, context inspector surfaces
├── hooks/                   # Runtime websocket, jam state, Strudel, audio/camera hooks
├── lib/                     # Runtime manager, Codex process wrappers, shared contracts
├── .codex/agents/           # Agent personas + normal-mode system prompt
├── .codex/skills/           # Project-local Codex skills
├── packages/mcp-server/     # Strudel MCP server
├── scripts/benchmarks/      # Runtime benchmark harness
└── docs/                    # Current docs plus v1/v2 historical references
```

## Requirements

- [Node.js](https://nodejs.org/) 18+
- Codex CLI with an authenticated local session
- A modern browser with audio support
- Camera permission if you want to use Camera Conductor

## Documentation

The current documentation entry point is [docs/README.md](./docs/README.md).

Key current-state docs:

- [V3 Codex Runtime Setup](./docs/v3/codex-runtime-setup.md)
- [V3 Model Policy Boundary](./docs/v3/model-policy-boundary.md)
- [V3 Model-Policy Playbook](./docs/v3/model-policy-playbook.md)
- [V3 Jam Boss Prompting Guide](./docs/v3/jam-boss-prompting-guide.md)
- [V3 Validation Rollout / Benchmark Notes](./docs/v3/bsj-6ud.1-validation-rollout-2026-02-25.md)

## License

AGPL-3.0, required by the [Strudel](https://strudel.cc) dependency.
