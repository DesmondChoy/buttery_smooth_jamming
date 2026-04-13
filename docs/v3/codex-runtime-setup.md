# Codex Runtime Setup

This document describes the active Codex runtime configuration for both normal
assistant mode and jam mode.

## Runtime Topology

The app exposes three transport surfaces:

| Route | Purpose |
|------|---------|
| `/api/ai-ws` | Primary provider-neutral websocket for normal assistant mode and jam control |
| `/api/runtime-ws` | Runtime implementation route that currently backs `/api/ai-ws` |
| `/api/ws` | Broadcast bridge between the browser Strudel runtime and the MCP server |

Normal assistant mode streams Codex text/tool events over `/api/ai-ws`. Jam mode
uses the same websocket path for `start_jam`, `set_jam_preset`,
`boss_directive`, `audio_feedback`, `camera_directive`, and `stop_jam`.

## Canonical Config Resolution

Runtime config resolves in this order:

1. `.codex/config.toml`
2. `config/codex/config.toml`

The repository currently ships `config/codex/config.toml`. Runtime code reads
that file, extracts the required profile fields, and injects equivalent `-c
key=value` overrides into each Codex invocation so profile resolution stays
aligned even when the project config lives outside `$CODEX_HOME`.

## Active Profiles

Two profiles are required:

| Profile | Current Role | Current Defaults |
|--------|--------------|------------------|
| `normal_mode` | Normal assistant mode with Strudel MCP access | `gpt-5-codex`, `model_reasoning_effort="low"`, `model_reasoning_summary="detailed"` |
| `jam_agent` | Long-lived jam workers with no tools and no MCP | `gpt-5-codex-mini`, `model_reasoning_effort="low"`, `model_reasoning_summary="detailed"` |

Shared config details in the bundled fallback config:

- `approval_policy = "never"`
- `sandbox_mode = "workspace-write"`
- `features.runtime_metrics = false`
- `mcp_servers.strudel.transport = "stdio"`
- `mcp_servers.strudel.command = "node"`
- `mcp_servers.strudel.args = ["packages/mcp-server/build/index.js"]`
- `mcp_servers.strudel.env.WS_URL = "ws://localhost:3000/api/ws"`

Normal mode keeps `mcp_servers.strudel.enabled = true`. Jam mode keeps
`mcp_servers.strudel.enabled = false` and `mcp_servers.playwright.enabled = false`.

## Startup Checks

Both the normal runtime (`CodexProcess`) and the camera-directive interpreter
fail closed through `assert_codex_runtime_ready()`. Startup validation checks:

1. a readable project Codex config exists at one of the supported paths
2. the `codex` binary is available
3. local Codex auth is valid (`codex login status`)
4. required profiles resolve: `normal_mode`, `jam_agent`
5. required MCP server registration resolves for normal mode: `strudel`

Successful checks are cached for 30 seconds to avoid repeating the full probe
on every turn.

## Install And Run

From the repo root:

```sh
npm install
cd packages/mcp-server && npm run build && cd ../..
npm run dev
```

Additional project commands:

```sh
npm run build
npm run start
npm run lint
npx vitest run
npm run test:e2e
npm run test:e2e:headed
npm run benchmark:workstream-g -- --jam-start-runs 2 --targeted-runs 2 --broadcast-runs 2
```

MCP server commands:

```sh
cd packages/mcp-server
npm run build
npm run dev
npm run start
```

`npm install` also runs the repo `prepare` script, which applies the `next-ws`
patch required for websocket route support in the Next.js app.

## Runtime Behavior Notes

### Normal Assistant Mode

- The runtime always instantiates `CodexProcess`.
- `build_exec_args()` runs `codex exec --json --profile normal_mode`.
- The normal-mode system prompt is loaded from
  `.codex/agents/normal-mode-system-prompt.md`.
- Runtime overrides `mcp_servers.strudel.env.WS_URL` per request so the browser
  bridge follows the current host/protocol.

### Jam Mode

- `AgentProcessManager` owns jam-state continuity, deterministic routing,
  session lifecycle, and final `stack(...)` composition.
- Jam sessions start in staged-silent mode and remain directive-gated until a
  preset is chosen and Play is pressed.
- Presets lock after the first manual join.
- Audio feedback and camera conductor samples flow through `/api/ai-ws`.
- Agent context inspection is enabled by default and records recent prompt and
  thread snapshots for the UI.

## Environment Variables

### Runtime Capacity

| Variable | Default | Purpose |
|---------|---------|---------|
| `MAX_CONCURRENT_JAMS` | `1` | Maximum simultaneous jam sessions |
| `MAX_TOTAL_AGENT_PROCESSES` | `4` | Maximum total active jam-agent processes |

### Camera And Conductor Controls

| Variable | Default | Purpose |
|---------|---------|---------|
| `CAMERA_INTERPRETATION_MIN_CONFIDENCE` | `0.55` | Minimum confidence required to accept a camera cue |
| `CAMERA_SAMPLE_MAX_AGE_MS` | `5000` | Rejects stale camera samples older than this age |
| `CAMERA_SAMPLE_MAX_FUTURE_SKEW_MS` | `1500` | Rejects camera samples too far in the future |
| `CONDUCTOR_INTENT_TOKEN` | unset | Required shared secret for the standalone `/api/conductor-intent` endpoint |
| `CONDUCTOR_INTENT_ALLOWED_HOSTS` | `localhost,127.0.0.1` | Host allowlist for the standalone conductor endpoint; `*` allows all hosts |

### Rollout Bookkeeping

| Variable | Accepted Values | Current Effect |
|---------|------------------|----------------|
| `NORMAL_RUNTIME_PROVIDER` | `codex` | The runtime provider remains `codex` in all cases |
| `NORMAL_RUNTIME_ROLLOUT_STAGE` | `pre_gate`, `post_gate` | Exposes rollout stage metadata; current runtime instantiation is unchanged |

## Standalone Conductor Intent Endpoint

`POST /api/conductor-intent` exposes the same camera-interpretation pipeline as
the websocket path for authorized callers. Requests must:

1. include `x-conductor-intent-token`
2. originate from an allowed host
3. provide a valid camera payload compatible with `normalize_camera_directive_payload`

Responses use the `ConductorInterpreterResult` shape and apply the same
freshness checks and schema-backed interpretation as websocket-driven camera
conductor events.

## Quick Verification

Run from the repo root:

```sh
codex --version
codex login status
codex mcp list --json \
  -c 'mcp_servers.strudel.command="node"' \
  -c 'mcp_servers.strudel.args=["packages/mcp-server/build/index.js"]'
```

Expected results:

- `codex --version` succeeds
- `codex login status` reports an authenticated local session
- `codex mcp list --json` includes `strudel`

An end-to-end runtime probe is also available through the benchmark harness:

```sh
npm run benchmark:workstream-g -- --jam-start-runs 2 --targeted-runs 2 --broadcast-runs 2
```

The benchmark connects to `/api/ai-ws`, waits for runtime `ready`, measures jam
start plus targeted and broadcast directive latency, and writes results to
`tmp/benchmarks/` unless `--output-dir` is provided.
