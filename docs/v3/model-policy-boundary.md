# V3 Jam Mode: Model Policy Boundary (bsj-7k4.1)

This document defines what is intentionally model-owned versus code-owned in
jam mode so we preserve creative autonomy without sacrificing determinism,
safety, or runtime reliability.

This is the canonical policy-boundary document for the v3 architecture.

## Purpose

The policy boundary exists to keep two truths simultaneously:

1. Agents should make real musical decisions (not just fill templates).
2. The runtime must remain deterministic for routing, safety, and continuity.

## Creative Autonomy Principle

In jam mode, the model owns interpretation and expression unless a directive is
explicit enough that code should deterministically anchor it.

Model latitude is explicitly allowed for:

- nuanced language interpretation ("make it feel anxious but controlled"),
- arrangement evolution across rounds,
- groove, timbre, and density choices per instrument role,
- expressive push/pull around the beat and phrase shape.

Code does not pre-author these musical choices. Code guarantees that the result
is routable, bounded, schema-valid, and safely composable.

## Boundary Matrix

| Decision Area | Model-Owned (Creative) | Code-Owned (Deterministic Guarantees) |
|---|---|---|
| Nuanced directive interpretation | Interprets ambiguous terms like "darker", "edgier", "floaty", "tenser" into instrument-appropriate musical moves. | Deterministic routing to targeted agents (`@mention`) and deterministic broadcast when no mention is present. |
| Tempo feel realization | Decides how tempo intent is expressed musically (subdivision density, articulation, syncopation). | Applies explicit tempo anchors (explicit BPM, half/double-time) with fixed precedence and bounds (`60..300`), and applies model-provided relative tempo deltas within minimal bounds. |
| Energy realization | Chooses how "more/less energy" manifests per agent role (note density, accents, dynamics, register). | Applies explicit numeric/semantic energy anchors with deterministic clamps (`1..10`), and applies model-provided relative energy deltas within minimal bounds. |
| Texture/timbre | Chooses synthesis/FX choices, effect movement, and texture transitions. | Enforces output schema validity and safe fallback behavior when output is invalid or missing. |
| Arrangement evolution | Decides when to hold, vary, build, or simplify over rounds. | Owns turn serialization, session lifecycle, timeout handling, and no-overlap guarantees. |
| Inter-agent musical adaptation | Reacts to band state and evolves in context. | Preserves canonical jam state server-side and broadcasts authoritative updates. |
| Pattern output content | Emits Strudel pattern + thoughts + reaction with agent personality. | Validates JSON shape, handles invalid output deterministically, and preserves prior valid pattern as fallback. |
| Harmonic context evolution | Agents suggest key changes (`suggested_key`) and chord progressions (`suggested_chords`) via structured decision blocks. | Code enforces consensus rules: key changes require 2+ agents with high confidence suggesting the same key; chord changes require a single agent with high confidence. Validated via `normalizeSuggestedKey()` and `deriveScale()`. |
| Final playback composition | None (agents do not decide final merge algorithm). | Server composes final output via deterministic `stack(...)` composition. |
| Runtime and process behavior | None (not model-controlled). | Preserves manager-owned, per-agent persistent Codex-backed sessions and controlled process lifecycle. |
| Agent identity and routing metadata | None (not inferred from model text). | Treats `AGENT_META` and agent key/file mappings as canonical. |

## Deterministic Precedence Rules

These rules define how conflicting intent is resolved.

### Global Intent Priority

1. Explicit targeted boss directive (for the addressed agent).
2. Explicit broadcast boss directive (for all active agents).
3. Deterministic parser/context anchors (key, explicit BPM, half/double-time, explicit energy anchors).
4. Model-provided relative tempo/energy intent (structured decisions).
4a. Agent key suggestion (2+ agent consensus, high confidence).
4b. Agent chord suggestion (single agent, high confidence).
4c. Auto-tick dampened tempo/energy drift (0.5x factor).
5. Hold current context and let agents evolve autonomously.

### Tempo Priority (Required Order)

1. Explicit BPM (`BPM 140`, `tempo 90`, `140bpm`).
2. Half/double-time directives (`half time`, `double time`).
3. Model-relative tempo intent (for example: subtle push/pull not encoded as explicit BPM).
4. No confident tempo decision: keep current BPM.

Notes:

- If a directive contains both explicit BPM and half/double-time language, the
  explicit BPM value wins.
- Relative tempo phrases like `faster`/`slower` are cues for model-provided
  tempo deltas and apply only when neither explicit BPM nor half/double-time
  matched.

### Energy Priority

1. Explicit numeric energy (`energy 8`, `energy to 3`).
2. Explicit semantic extremes (`full energy`, `max energy`, `minimal`).
3. Model-relative energy intent (triggered by relative energy cues).
4. No confident decision: keep current energy.

### Texture Priority

1. Explicit boss constraints (for example: "no hats", "keep this dry", "add shimmer only to FX").
2. Hard runtime constraints (schema validity, safe output handling).
3. Model-owned timbre/effect decisions.
4. No confident decision: preserve prior texture or use `no_change`.

### Arrangement Priority

1. Explicit arrangement intent from boss ("breakdown", "drop", "build", "strip back", "bring bass forward").
2. Deterministic continuity constraints (active agents, turn ordering, canonical state).
3. Model-owned micro-arrangement and phrase-level evolution.
4. No confident decision: continuity-first hold (`no_change`) over disruptive reset.

## Failure, Fallback, and Confidence Policy

Failure handling must preserve session flow and musical continuity.

| Scenario | Deterministic Behavior | Autonomy-Preserving Default |
|---|---|---|
| Invalid output shape (missing `pattern`/`thoughts`/`reaction`) | Reject response, mark agent as timeout/error path, keep session alive. | Reuse last known valid `fallbackPattern` so groove continues. |
| Unparseable/empty model output | Treat as failed turn; do not crash jam. | Continue with last valid pattern or `silence` only if no fallback exists. |
| Targeted agent unavailable | Emit deterministic `directive_error`; do not mutate unrelated agents. | Keep the rest of the band running unchanged. |
| No decision from model | Accept `no_change` behavior; do not force synthetic change. | Preserve existing pattern and continue autonomous evolution on later turns. |
| Low confidence decision | Do not escalate to rigid hardcoded music templates. | Apply conservative move (`no_change` or minimal delta), then allow next rounds to recover expressively. |

### Confidence Handling Bands

When a structured decision contract is available, apply:

1. `high` confidence: apply model decision directly (within hard bounds).
2. `medium` confidence: apply with continuity bias (smaller deltas).
3. `low` confidence: prefer `no_change` or fallback pattern, not hard reset.

Auto-tick applies an additional 0.5x dampening factor on top of confidence
scaling for tempo and energy deltas, preventing runaway drift when agents
autonomously evolve every 30 seconds.

### Minimal Guardrails for Model-Relative Context Deltas

When structured decisions are present, code applies only minimal bounds:

1. `tempo_delta_pct` normalized to `-50..50`.
2. `energy_delta` normalized to `-3..3`.
3. Final BPM clamped to `60..300`.
4. Final energy clamped to `1..10`.
5. If a relative cue is present but no usable decision is returned, preserve
   current tempo/energy (no synthetic fallback delta).
6. `suggested_key` must match `/^[A-Ga-g][bB#]?\s+(major|minor)$/i` and
   produce a valid scale via `deriveScale()` to be accepted.
7. `suggested_chords` must be a non-empty array of strings.

## Examples of Allowed Model Latitude

These examples are intentionally model-owned and should not be hardcoded:

1. Boss: "Make it more tense but keep it danceable."
   Model latitude: drums tighten syncopation, bass narrows register, melody uses
   dissonant passing tones, FX increases modulation depth.
2. Boss: "@BEAT double time but don't overcrowd the pocket."
   Code guarantee: tempo context updates deterministically for the targeted turn.
   Model latitude: BEAT chooses ghost-note strategy versus full subdivision fill.
3. Boss: "GLITCH, add texture but stay out of ARIA's register."
   Code guarantee: deterministic targeted routing and safe composition.
   Model latitude: GLITCH picks effect type, motion curve, and rhythmic placement.
4. Auto-tick round (no boss directive):
   ARIA suggests "Eb major" with high confidence, GLITCH also suggests "Eb major"
   with high confidence → 2+ agents agree, key changes to Eb major, scale and chords
   auto-derived. BEAT suggests "G minor" with low confidence alone → ignored
   (requires high confidence and 2+ agent consensus).

## Architecture Invariants Preserved

This policy explicitly preserves the v3 architecture invariants:

1. Dual-mode architecture remains intact (normal assistant mode + jam mode).
2. `@mention` routing remains deterministic in code (not model inference).
3. Jam mode keeps per-agent persistent Codex-backed sessions for latency.
4. Final combined pattern stays server-composed via deterministic `stack(...)`.
5. WebSocket broadcast-callback pattern remains the server broadcast mechanism.
6. Jam agents remain toolless (`--tools '' --strict-mcp-config`) unless intentionally changed.
7. `AGENT_META` and agent key mappings remain canonical identity/routing sources.

## Scope Note

This is a policy definition document. Implementation milestones can adopt this
contract incrementally while preserving existing jam behavior and tests.
