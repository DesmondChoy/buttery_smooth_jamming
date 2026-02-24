# bsj-6u9.1 Codex Compatibility Spike Report

- Date: 2026-02-24
- Issue: `bsj-6u9.1` (Workstream A: Codex compatibility spike and decision gate)
- Author: Codex + operator-run local execution
- Scope of this report: CLI compatibility and structured-output viability for v3 migration planning

## Summary

The compatibility spike passed all implemented checks for ChatGPT-authenticated Codex CLI usage in this repository.

Primary outcomes:

1. Codex CLI non-interactive execution works with stable overrides.
2. JSON event stream output works and can be parsed.
3. Schema-constrained jam-agent JSON output works with `gpt-5-codex-mini`.
4. Strict semantic checks (Strudel-like `pattern`, brace-noise guard in `reaction`) passed.

Current status: **GO** for starting runtime abstraction work (`bsj-6u9.4`), with one caveat:
- app-path latency/reliability benchmarking (jam start + targeted/broadcast directives) remains to be measured in a dedicated benchmark tranche before final migration acceptance.

## Environment and Inputs

- Repo: `buttery_smooth_jamming`
- Codex CLI: `codex-cli 0.104.0`
- Auth mode: ChatGPT login
- Operator shell: fish

Spike run artifacts:

- Summary: `tmp/spike/bsj-6u9.1-20260224-215508/summary.md`
- Raw table: `tmp/spike/bsj-6u9.1-20260224-215508/results.tsv`
- Logs/timings/messages: `tmp/spike/bsj-6u9.1-20260224-215508/*`

Script used:

- `scripts/spikes/run-bsj-6u9-1-spike.sh`

## Shared Codex Overrides Used

All `codex exec` checks used these overrides:

1. `mcp_servers.playwright.enabled=false`
2. `mcp_servers.playwright.required=false`
3. `model_reasoning_effort="low"`
4. `model_reasoning_summary="detailed"`
5. `features.runtime_metrics=false`

Rationale:

- This avoids failure from a required-but-unavailable MCP server in automation contexts.
- It forces model-compatible reasoning settings that are currently stricter than some global defaults.

## Results

From `tmp/spike/bsj-6u9.1-20260224-215508/results.tsv`:

1. `login_status`: PASS (`0.06s`)
2. `mcp_list`: PASS (`0.05s`)
3. `smoke_exact`: PASS (`3.70s`) — exact `SPIKE_OK`
4. `json_stream_exact`: PASS (`1.42s`) — exact `JSON_OK`
5. `schema_basic`: PASS (`3.53s`) — valid JSON with required fields
6. `schema_strict`: PASS (`4.00s`) — strict schema + semantic guards passed

Totals:

- PASS: 6
- PARTIAL: 0
- FAIL: 0

## Key Findings and Decisions

### 1) Model viability for jam agents

- `codex-mini-latest` is not viable in this ChatGPT-auth flow (observed earlier during spike prep; unsupported).
- `gpt-5-codex-mini` is viable and passed strict output checks.

Decision for next tranche:

- Use `gpt-5-codex-mini` as the active jam latency candidate.

### 2) Session strategy

Decision: **manager-managed long-lived sessions remain the target strategy** for jam mode.

Why:

1. It aligns with existing deterministic routing and orchestration design.
2. No compatibility blocker was found in Codex CLI usage patterns tested so far.
3. It avoids dependency on experimental built-in multi-agent behavior for GA-critical paths.

### 3) Config constraints that must be captured in migration

The runtime must not assume permissive global Codex config. Project defaults should explicitly set:

1. model-compatible reasoning effort/summary values
2. jam profile toolless behavior
3. explicit MCP requirements by mode

## Remaining Work to Complete Workstream A Gate

This report closes the compatibility slice but does not yet include app-flow latency and directive reliability measurements.

Required next benchmark tranche:

1. Jam start latency (4-agent)
2. Targeted directive latency (`@mention`)
3. Broadcast directive latency
4. Directive success rate over repeated runs

Suggested target gates (balanced profile):

1. Targeted directive p95 `<= 8s`
2. Jam start p95 `<= 20s`
3. Directive success rate `>= 98%`

## Go/No-Go Snapshot

- Compatibility gate: **GO**
- Full Workstream A completion: **PARTIAL (latency/reliability tranche pending)**

Recommended next issue sequencing:

1. Start `bsj-6u9.4` interface-abstraction design in parallel with benchmark harness prep.
2. Complete benchmark tranche and fold results into this report before closing `bsj-6u9.1`.
