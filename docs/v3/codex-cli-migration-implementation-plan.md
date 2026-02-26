# V3 Implementation Plan: Migrate to Codex CLI + OpenAI Subagents

> Status: Execution in progress (Workstreams A-F closed; G open). Post-migration musical enhancements (bsj-bx1 epic, 8 issues) shipped.
> Last updated: February 26, 2026 (bsj-bx1 epic documentation update)
> Scope: Repository-level migration plan only (no code changes in this document)

## Terminology

- **GA** = **General Availability** (the production-ready default release target for v3).

## Objective

Migrate Buttery Smooth Jamming from:

- legacy provider-specific normal/jam runtime wiring
- legacy sub-agent orchestration patterns

To:

- `Codex CLI` as the runtime engine in both normal and jam modes
- OpenAI/Codex-based sub-agent orchestration for band members

Primary product and cost objective:

1. Keep the same cost model intent as v2: no direct app-level API integration in runtime paths.
2. Run via local CLI authenticated with a ChatGPT account (rather than embedding API keys in app code).
3. Keep usage within the account’s Codex access/rate limits under the active ChatGPT subscription tier.

GA defaults locked for this plan:

1. v3 GA runtime scope is developer desktops authenticated via ChatGPT login.
2. Headless/CI runtime via API key is out of scope for v3 GA.
3. Jam mode GA uses manager-controlled long-lived per-agent Codex CLI processes.
4. Jam agents are hard-toolless (no built-in tools and no MCP).
5. WebSocket cutover is direct to `/api/ai-ws` (no legacy compatibility alias in GA).
6. Jam sub-agent default model is `gpt-5-codex-mini` (latency-optimized and validated in ChatGPT-auth Codex CLI flow).
7. Normal mode default model is `gpt-5-codex`.

## Non-Goals

- Do not redesign jam UX, musical logic, or Strudel composition semantics.
- Do not remove dual-mode architecture (normal assistant mode + jam mode).
- Do not migrate to direct OpenAI REST API integration for core runtime flows in v3.
- Do not make CI/headless API-key runtime a GA requirement.

## Current State (v2)

The current architecture is tightly coupled to Codex CLI process semantics:

- Normal mode process wrapper: `lib/codex-process.ts`
- Jam mode per-agent manager: `lib/agent-process-manager.ts`
- WebSocket route and process orchestration: `app/api/ai-ws/route.ts`
- Client hook naming and status model: `hooks/useAiTerminal.ts`
- Persona files loaded by jam manager: `.codex/agents/*.md`

Key behaviors to preserve during migration:

1. Deterministic `@mention` routing in code (no model inference for routing).
2. Per-agent isolation in jam mode.
3. Server-side composition of final `stack()` pattern.
4. Broadcast callback pattern over websocket.

## Target Architecture (v3 GA)

Recommended GA approach: **manager-controlled Codex processes per logical agent** (not model-decided routing).

1. Normal mode:
- Replace `CodexProcess` with `CodexProcess` wrapper.
- Preserve process-lifetime continuity as baseline behavior.
- Treat session resume as optional optimization/fallback, not a correctness dependency.
- Preserve websocket message payload contract where practical while moving endpoint naming to provider-neutral paths.

2. Jam mode:
- Keep `AgentProcessManager` orchestration pattern (deterministic, server-owned).
- Replace `codex exec` workers with long-lived Codex CLI workers.
- Maintain one active long-lived process per active band agent (`drums`, `bass`, `melody`, `fx`) for session duration.
- Enforce structured responses for each agent turn.
- Keep jam-state ownership in manager and server-side `stack()` composition.
- Use `gpt-5-codex-mini` as the default jam-agent model in GA.

3. Config + policy:
- Introduce project-level `.codex/config.toml` as canonical Codex runtime config.
- Keep existing MCP server and Strudel tool flow for normal mode.
- Enforce hard toolless jam agents via dedicated profile and fail-closed startup checks.

4. Frontend transport contract:
- Move route from `/api/ai-ws` to `/api/ai-ws` in GA.
- Rename `useAiTerminal` and related provider-specific identifiers to neutral names.
- Preserve message payload schema (`text`, `tool_use`, `tool_result`, `status`, `error`, jam broadcast types) where possible.

## Why This Migration Is Feasible (Research Summary)

1. Codex CLI supports ChatGPT-account authentication and can run locally in terminal workflows.
2. Codex CLI supports non-interactive scripted usage with JSON/JSONL output and schema-constrained outputs.
3. Codex supports MCP server configuration in `config.toml`, including project-scoped `.codex/config.toml` for trusted projects.
4. Codex supports experimental multi-agent collaboration, but it is explicitly experimental; GA reliability must not depend on it.
5. Codex uses AGENTS.md instruction layering compatible with this repo’s existing instruction-driven workflow.

## Detailed Migration Tasks

### Workstream A: Compatibility Spike and Decision Gate

Goal: prove that Codex can satisfy runtime constraints before full refactor.

Tasks:

1. Install and authenticate Codex CLI in local dev environments (ChatGPT login path).
2. Validate local execution modes needed by repo:
- non-interactive run
- JSON event stream parsing
- schema-constrained outputs for jam agent responses
- long-lived process behavior across many turns (normal and jam)
- optional session resume behavior (optimization path only)
3. Validate jam profile isolation:
- confirm jam agents cannot call tools
- confirm jam agents cannot access MCP servers
4. Measure baseline latency:
- normal mode one-turn round-trip
- jam targeted directive (`@BEAT ...`)
- jam broadcast directive
5. Lock v3 GA gates:
- define exact p95 latency targets
- define minimum directive success-rate target
- define degraded behavior for auth/quota failures
6. Validate model defaults:
- confirm `gpt-5-codex-mini` jam-agent quality/latency meets gates
- confirm `gpt-5-codex` normal-mode quality is acceptable with MCP workflows

Deliverables:

- Spike report in `docs/v3/` with measured timings and failure modes.
- Go/No-go decision against GA acceptance gates.

### Workstream B: Runtime Abstraction Layer

Goal: decouple websocket/business logic from Codex-specific process classes.

Tasks:

1. Introduce engine-neutral interfaces:
- process lifecycle (`start`, `send`, `stop`, `isRunning`)
- streaming event model (`text`, `tool_use`, `tool_result`, `status`, `error`)
2. Add `CodexProcess` implementation for normal mode.
3. Add `CodexAgentSession` implementation for jam-agent long-lived workers.
4. Keep orchestration ownership in route/manager layers while swapping process implementations behind interfaces.

Deliverables:

- New provider abstraction in `lib/`.
- Existing websocket message payload schema preserved.

### Workstream C: Normal Mode Migration

Goal: harden and finalize Codex runtime in normal assistant mode.

Tasks:

1. Port system prompt/tool instructions into Codex invocation prompt contract.
2. Wire MCP server access through Codex config/profile.
3. Map Codex JSON events into existing frontend message types.
4. Preserve existing stop/reconnect behaviors.
5. Keep session resume optional and gated behind internal implementation detail.
6. Add regression tests for normal mode command routing and websocket statuses.

Deliverables:

- Normal mode runs end-to-end on Codex CLI only.
- No legacy provider dependency on normal mode path.

### Workstream D: Jam Sub-Agent Migration

Goal: move jam agents from legacy worker orchestration to Codex-backed sessions while preserving deterministic orchestration.

Tasks:

1. Replace legacy jam worker spawn logic with long-lived Codex-backed worker processes.
2. Preserve per-agent personas and state continuity:
- migrate `.codex/agents/*.md` content to provider-agnostic location (for example `prompts/agents/` or `.codex/agents/`)
- maintain `AGENT_META` and deterministic key mapping as canonical
3. Enforce strict output shape for each agent turn:
- `pattern`, `thoughts`, `reaction`
- reject/repair invalid responses
4. Enforce hard toolless jam policy:
- jam profile must disable tool usage and MCP access
- startup must fail closed if toolless restrictions cannot be confirmed
5. Preserve jam-state ownership in manager and server-side `stack()` composition.
6. Keep autonomous tick loop, timeout handling, and fallback patterns.

Deliverables:

- Jam start/directive/stop flows running on Codex-backed sub-agents.
- No legacy provider dependency on jam path.

### Workstream E: Codex Config, Policy, and Security Hardening

Goal: ensure reproducible local behavior across contributors without hidden provider drift.

Tasks:

1. Add `.codex/config.toml` as canonical runtime config with project-scoped defaults:
- model/profile defaults
- sandbox and approval policy guidance
- MCP server registration for Strudel tools
  - runtime fallback path `config/codex/config.toml` may be used in sandboxed environments where `.codex/` is read-only
2. Define separate profiles:
- `normal_mode` profile (MCP tools enabled, default model `gpt-5-codex`)
- `jam_agent` profile (hard toolless + no MCP, default model `gpt-5-codex-mini`)
3. Add startup checks:
- verify `codex` binary present
- verify auth state
- verify required profiles are resolvable
- verify required MCP server availability for normal mode only
4. Add clear fallback errors in UI when Codex is unavailable.
5. Define configuration migration/deprecation steps:
- deprecate legacy runtime config usage on v3 code paths
- document one source of truth to avoid split config drift

Deliverables:

- Documented, reproducible `codex` setup for local dev.
- No accidental dependency on API keys in default runtime path.

### Workstream F: Frontend/Contract Cleanup and Naming

Goal: remove provider-specific naming while preserving behavior.

Tasks:

1. Rename provider-specific route/hook/type names in active paths:
- route: legacy aliases -> `/api/ai-ws` (direct cutover)
- hook: runtime/provider-specific aliases -> provider-neutral equivalents
2. Update frontend wiring and imports in the same migration window to avoid mixed naming.
3. Update docs and developer commands to Codex-first language.

Deliverables:

- Provider-neutral naming in active code paths.
- Updated docs in `docs/README.md` and `docs/v3/*`.

### Workstream G: Testing, Benchmarks, and Rollout

Goal: cut over safely with measurable quality/performance gates.

Tasks:

1. Unit tests:
- event parsing
- structured output validation
- routing invariants
2. Integration tests:
- normal mode E2E happy path
- jam mode start/directive/stop
- targeted vs broadcast directives
- jam toolless policy invariant checks
3. Performance benchmark pass versus v2 baseline with explicit thresholds.
4. Cutover rollout:
- default runtime is Codex after acceptance gates pass
- no legacy compatibility websocket alias in GA
5. Reliability hardening for jam continuity:
- resumed jam turns must not inherit incompatible global reasoning defaults
- unavailable agents must remain `error` until a real process recovery occurs (no auto-tick masking)

Deliverables:

- Benchmarked v3 report with exact measurement date/method.
- Legacy compatibility runtime shims removable after stabilization window.

## Acceptance Criteria (v3 Migration Complete)

1. All runtime paths use Codex CLI by default; no legacy provider runtime is required for standard operation.
2. Jam mode uses manager-controlled long-lived Codex sub-agent processes with deterministic routing intact.
3. Normal mode MCP Strudel tooling remains functional.
4. No direct API-key integration is required in default runtime flow.
5. Jam agents are hard-toolless and cannot access MCP in GA.
6. Frontend/runtime route uses `/api/ai-ws` and provider-neutral naming in active code paths.
7. Documentation and onboarding steps are Codex-first and reproducible.
8. Latency and reliability meet explicit benchmark gates:
- `p95 targeted directive latency <= 8 seconds`
- `p95 jam start latency (4 agents) <= 20 seconds`
- `directive success rate >= 98%` over benchmark run
9. Model defaults are enforced in config and docs:
- normal mode: `gpt-5-codex`
- jam sub-agents: `gpt-5-codex-mini`

## Risks and Mitigations

1. Risk: Codex built-in multi-agent is experimental.
- Mitigation: keep manager-orchestrated per-agent sessions as GA path; treat built-in multi-agent as optional R&D.

2. Risk: session startup/resume latency may exceed jam needs.
- Mitigation: benchmark in Workstream A; optimize prompt/context size and process warm-start behavior; gate GA on defined thresholds.

3. Risk: tool exposure or MCP drift across profiles.
- Mitigation: explicit `.codex/config.toml` profiles + startup assertions + tests.

4. Risk: plan/quota differences across ChatGPT tiers.
- Mitigation: document supported plan assumptions, set internal ops guidance, and define degraded behavior on quota/auth exhaustion.

5. Risk: direct endpoint cutover breaks stale clients.
- Mitigation: synchronize frontend and route migration in one change set; verify with integration tests.

6. Risk: model alias or account-availability mismatch for selected defaults.
- Mitigation: add startup validation with clear error messaging and a documented operator override path.

7. Risk: resumed jam turns inherit global Codex defaults that are invalid for jam model settings.
- Mitigation: always inject profile-scoped and top-level reasoning overrides per turn; verify with resume-path regression tests.

8. Risk: auto-tick can mask crashed agents by reapplying fallback statuses.
- Mitigation: auto-tick only targets currently available agent sessions and preserves `error` state for unavailable agents.

## Workstream A Outcome Snapshot (2026-02-24)

Compatibility spike artifacts:

1. Report: `docs/v3/bsj-6u9.1-codex-compatibility-spike-2026-02-24.md`
2. Runner: `scripts/spikes/run-bsj-6u9-1-spike.sh`

Outcome summary:

1. `bsj-6u9.1` compatibility checks passed with `gpt-5-codex` (normal) and `gpt-5-codex-mini` (jam schema/semantic checks).
2. `codex-mini-latest` is not viable in the tested ChatGPT-auth Codex CLI setup and is not the GA default.
3. Manager-managed long-lived sessions remain the selected jam strategy.

## Beads Execution Snapshot (as of 2026-02-25 +08:00)

Migration epic status:

1. `bsj-6u9` (V3 runtime provider migration) is closed.

Workstream-linked task status:

1. Workstream A (`bsj-6u9.1`) is closed.
2. Workstream B (`bsj-6u9.4`) is closed.
3. Workstream C (`bsj-6u9.5`) is closed.
4. Workstream D (`bsj-3xy.2`) is closed.
5. Workstream E (`bsj-3xy.4`) is closed.
6. Workstream F (`bsj-3xy.5`) is closed.
7. Workstream G (`bsj-6ud.1`) is open.

Additional same-day cleanup related to Workstream F:

1. `bsj-wtg` (rename runtime-facing legacy identifiers to provider-neutral naming) is closed.

Remaining execution focus after this snapshot:

1. Complete Workstream G tests, benchmark tranche, and staged rollout (`bsj-6ud.1`).

## Workstream G Hardening Note (2026-02-25)

During directive-phase validation, jam mode showed an intermittent mixed-state failure:

1. Some agents succeeded quickly while others failed on resumed turns with `turn.failed` and non-zero exits.
2. Failed agents appeared to recover around the 30-second mark because auto-tick reapplied fallback status updates.

Root causes identified and addressed:

1. `codex exec resume` inherited global reasoning defaults (for example `reasoning.effort=xhigh`) incompatible with `gpt-5-codex-mini`.
2. Auto-tick processed unavailable agents and could overwrite `error` with fallback `playing`/`timeout`.

Hardening implemented:

1. Runtime config overrides now include profile-scoped plus top-level reasoning settings (`model_reasoning_effort`, `model_reasoning_summary`) chosen by execution profile.
2. Jam manager uses jam-profile defaults; normal mode uses normal-profile defaults.
3. Auto-tick targets only currently available agents, preserving crashed-agent `error` status until genuine recovery.
4. Jam logs now surface parsed `turn.failed` details for faster diagnosis.

## Post-Migration Musical Enhancements (bsj-bx1)

After the v3 runtime migration, the bsj-bx1 epic (8 issues, all closed) delivered
musical capability enhancements on top of the Codex-backed architecture:

1. **Randomized starting context** (bsj-bx1.1): Each jam starts with a random key/BPM/genre/energy from curated presets.
2. **Expanded sound palettes** (bsj-bx1.2): Agent prompts broadened to include genre-diverse sound sources.
3. **Relaxed register constraints** (bsj-bx1.3): Removed rigid register boundaries that limited melodic range.
4. **Genre-aware energy guidance** (bsj-bx1.4): Dynamic energy guidance injection based on genre context.
5. **Agent prompt refinements** (bsj-bx1.5): BPM in example headers, diversified examples beyond C minor EDM.
6. **Expanded Strudel reference** (bsj-bx1.6): Added soundfonts, FM synthesis, wavetables, scales, and chords to `lib/strudel-reference.md`.
7. **Chord progression parsing** (bsj-bx1.7): `deriveChordProgression()` in musical-context-parser for automatic chord derivation from key.
8. **Agent context suggestions** (bsj-bx1.8): Auto-tick decision aggregation with 0.5x dampening, `suggested_key`/`suggested_chords` fields, consensus rules for harmonic evolution.

See [Model Policy Boundary](./model-policy-boundary.md) for the full creative-autonomy
contract including agent suggestion precedence and consensus rules.

## Model-Driven Musical Policy (bsj-7k4)

The bsj-7k4 epic hardened the model/code boundary established during bsj-bx1:
audited all hardcoded musical/policy behavior, classified each as code-owned (A),
prompt-owned (B), or hybrid (C), and produced an operator playbook for tuning
and extending policy.

- [Hardcoding Audit](./hardcoding-audit-bsj-7k4.8.md): Full A/B/C inventory and follow-up bead mapping
- [Operator Playbook](./model-policy-playbook.md): Tuning knobs, failure triage, policy extension guidance

## Source Links (Corroboration)

Codex CLI and configuration:

- https://developers.openai.com/codex/cli
- https://developers.openai.com/codex/noninteractive
- https://developers.openai.com/codex/cli/reference
- https://developers.openai.com/codex/config-basic
- https://developers.openai.com/codex/mcp
- https://developers.openai.com/codex/multi-agent
- https://developers.openai.com/codex/guides/agents-md

OpenAI platform context (optional future path / not required for v3 CLI-only core):

- https://openai.github.io/openai-agents-js/guides/multi-agent/
- https://openai.github.io/openai-agents-js/guides/handoffs/
- https://openai.github.io/openai-agents-js/guides/tools/
- https://openai.github.io/openai-agents-js/guides/sessions/
- https://openai.github.io/openai-agents-js/guides/running-agents/
