# Model-Policy Operator Playbook (bsj-7k4.9)

Parent epic: `bsj-7k4` (Model-driven Musical Policy via Skills)

This playbook ties together the model-policy architecture for operators who need
to tune jam behavior, triage failures, or extend policy without introducing
hardcoded musical logic. It is the operator-facing companion to the canonical
boundary definition at [Model Policy Boundary](./model-policy-boundary.md).

---

## 1. Architecture Overview

### Model/Code Split

The jam runtime separates **model-owned creativity** from **code-owned
determinism**. Models interpret musical intent, choose patterns, and express
personality. Code guarantees routing, schema validity, bounded context updates,
and deterministic composition. The full boundary matrix and precedence rules
live in [model-policy-boundary.md](./model-policy-boundary.md) — this playbook
does not duplicate them.

### System Prompt Assembly

`buildAgentSystemPrompt()` in `lib/agent-process-manager.ts` composes each
agent's system prompt from five layers, injected in this order:

```
┌─────────────────────────────────────────────┐
│  Layer 1: Agent Persona                     │
│  (.codex/agents/{agent}.md, frontmatter     │
│   stripped, wrapped in <agent_persona>)      │
├─────────────────────────────────────────────┤
│  Layer 2: Shared Jam Policy                 │
│  (lib/jam-agent-shared-policy.ts →          │
│   <shared_policy> block with                │
│   <jam_musical_policy> + <strudel_validity  │
│   _policy> sub-blocks)                      │
├─────────────────────────────────────────────┤
│  Layer 3: Genre-Energy Guidance             │
│  (lib/genre-energy-guidance.ts →            │
│   <genre_energy_guidance> block, parsed     │
│   from .codex/skills/genre-energy-guidance/ │
│   SKILL.md at startup, with generic         │
│   fallback per role)                        │
├─────────────────────────────────────────────┤
│  Layer 4: Strudel API Reference             │
│  (lib/strudel-reference.md →               │
│   <strudel_reference> block, read once      │
│   at manager construction)                  │
├─────────────────────────────────────────────┤
│  Layer 5: Turn Context                      │
│  (jam-start/directive/auto-tick phrasing    │
│   from lib/jam-manager-context-templates.ts │
│   then buildAgentTurnPrompt() wraps with    │
│   <manager_turn> + JSON contract + decision │
│   schema instructions)                      │
└─────────────────────────────────────────────┘
```

Layers 1-4 are assembled once at agent spawn. Layer 5 wraps every individual
turn (jam start, directive, auto-tick).

### Directive Processing Flow

`handleDirective()` in `lib/agent-process-manager.ts` processes a boss directive
through these numbered steps:

1. **Parse deterministic anchors** — `parseDeterministicMusicalContextChanges()`
   extracts explicit key, BPM, half/double-time, and explicit energy values.
2. **Detect relative cues** — `detectRelativeMusicalContextCues()` flags
   tempo increase/decrease and energy increase/decrease phrases.
3. **Apply deterministic context** — If step 1 found anchors, apply them to
   `musicalContext` immediately (before agents see the turn).
4. **Route to targets** — Targeted (`@mention`) routes to one agent;
   broadcast routes to all active agents. Unavailable targets emit
   `directive_error` without mutating other agents.
5. **Collect responses** — All targeted agents respond in parallel with JSON
   (`pattern`, `thoughts`, `commentary`, optional `decision`).
6. **Validate and apply patterns** — `applyAgentResponse()` validates schema,
   handles `no_change` and `silence` sentinels, and manages fallback continuity.
7. **Apply model-relative deltas** —
   `applyModelRelativeContextDeltaForDirectiveTurn()` aggregates
   `tempo_delta_pct` and `energy_delta` from agent `decision` blocks, scaled by
   confidence. Only applied when no deterministic anchor matched for that field
   and a matching relative cue direction was detected.
8. **Compose and broadcast** — `composePatterns()` builds `stack(...)` from
   non-silence agent patterns; `composeAndBroadcast()` sends the combined
   pattern + full jam state to the browser.

### Auto-Tick Flow

`sendAutoTick()` in `lib/agent-process-manager.ts` fires every 30 seconds
(reset after each directive):

1. **Increment round** and build context for each active agent (band state,
   current pattern, musical context).
2. **Collect responses** — All agents respond in parallel.
3. **Apply patterns** — Same `applyAgentResponse()` validation as directives.
4. **Aggregate dampened drift** —
   `applyModelRelativeContextDeltaForAutoTick()` averages all agent
   `tempo_delta_pct` and `energy_delta` values (scaled by confidence), then
   multiplies by `AUTO_TICK_DAMPENING` (0.5) before applying.
5. **Apply context suggestions** — `applyContextSuggestions()` processes
   `suggested_key` (requires 2+ agent high-confidence consensus) and
   `suggested_chords` (requires 1 agent high confidence).
6. **Compose and broadcast** — Same as directive flow.

Key difference from directives: auto-tick has no boss cue direction to match,
so all agent deltas are included (not filtered by cue compatibility). The 0.5x
dampening factor compensates for this broader inclusion.

### A/B/C Classification Rubric

The [hardcoding audit](./hardcoding-audit-bsj-7k4.8.md) classifies every
hardcoded behavior using three categories:

| Category | Definition | Example |
|----------|-----------|---------|
| **A** (Code) | Must stay deterministic in code: invariants, routing, schema, lifecycle, safety, canonical mappings | `@mention` routing, `stack()` composition, BPM clamps |
| **B** (Skill/Prompt) | Better as skill/prompt/policy content: text or musical interpretation rules embedded in runtime | Shared policy lines, genre guidance text, relative cue lexicon |
| **C** (Hybrid) | Deterministic shell stays in code, but tuning values or text should be documented/externalized | Confidence multipliers, consensus thresholds, dampening factor |

---

## 2. Operator Tuning Knobs

### Governance Constants

All governance constants are defined in `lib/jam-governance-constants.ts`
(the `JAM_GOVERNANCE` object) and imported by consuming modules.

| Constant | Value | Source → Consumers | Controls | Increase Effect | Decrease Effect | Risk |
|----------|-------|---------------------|----------|-----------------|-----------------|------|
| `AGENT_TIMEOUT_MS` | `15000` | `jam-governance-constants.ts` → `sendToAgentAndCollect()` | Max wait for a single agent turn response | More tolerance for slow models; longer perceived lag | Faster failure detection; may cut off valid slow responses | Too low → frequent timeouts; too high → UI feels stuck |
| `CONFIDENCE_MULTIPLIER` low | `0` | `jam-governance-constants.ts` → `getDecisionConfidenceMultiplier()` | Weight applied to low-confidence decisions | N/A (fixed at 0 — low-confidence deltas are zeroed) | N/A | Raising above 0 lets uncertain agents move context |
| `CONFIDENCE_MULTIPLIER` medium | `0.5` | `jam-governance-constants.ts` → `getDecisionConfidenceMultiplier()` | Weight applied to medium-confidence decisions | Medium-confidence agents drive bigger changes | Medium-confidence agents have less impact | Drift sensitivity changes unpredictably |
| `CONFIDENCE_MULTIPLIER` high | `1` | `jam-governance-constants.ts` → `getDecisionConfidenceMultiplier()` | Weight applied to high-confidence decisions | N/A (already 1x — full weight) | High-confidence agents would be partially muted | Breaks model trust contract |
| `AUTO_TICK_DAMPENING` | `0.5` | `jam-governance-constants.ts` → `applyModelRelativeContextDeltaForAutoTick()` | Multiplier on averaged auto-tick tempo/energy drift | Faster autonomous evolution; potential runaway drift | More stable but potentially static jams | Runaway BPM/energy at high values; dead jams at very low |
| `KEY_CONSENSUS_MIN_AGENTS` | `2` | `jam-governance-constants.ts` → `applyContextSuggestions()` | Minimum agreement for key modulation | N/A (2 is already minimum meaningful consensus) | Single-agent key changes → unstable harmonic shifts | Lowering risks whiplash key changes |
| Chord consensus threshold | 1 agent, `high` confidence | `applyContextSuggestions()` | Minimum for chord progression change | More agents required → harder to change chords | N/A (1 is minimum) | Already permissive; raising prevents stale progressions |
| `TEMPO_DELTA_PCT_MIN/MAX` | `[-50, 50]` | `jam-governance-constants.ts` → `normalizeDecisionBlock()` | Clamp range for relative tempo deltas | Allows larger per-turn tempo swings | Limits how fast tempo can change per turn | Wide range → BPM jumps; narrow range → sluggish response |
| `ENERGY_DELTA_MIN/MAX` | `[-3, 3]` | `jam-governance-constants.ts` → `normalizeDecisionBlock()` | Clamp range for relative energy deltas | Allows larger per-turn energy swings | Limits how fast energy can change per turn | Wide range → jarring energy jumps |
| `BPM_MIN/MAX` | `[60, 300]` | `jam-governance-constants.ts` → `parseDeterministicMusicalContextChanges()`, `applyModelRelativeContextDeltaForDirectiveTurn()`, `applyModelRelativeContextDeltaForAutoTick()` | Hard bounds on final BPM value | N/A (expanding is possible but rarely useful) | Narrows the playable tempo range | Outside [60, 300] produces unmusical results |
| `ENERGY_MIN/MAX` | `[1, 10]` | `jam-governance-constants.ts` → same locations as BPM clamp | Hard bounds on final energy value | N/A | N/A | Fixed scale — changing breaks UI and prompt assumptions |
| `AUTO_TICK_INTERVAL_MS` | `30000` ms | `jam-governance-constants.ts` → `startAutoTick()` | Time between autonomous evolution rounds | Slower autonomous evolution; longer static stretches | Faster evolution; more API calls; potential cost/latency | Too fast → rate limits; too slow → stale jams |

### Environment Variables

Set these in the server environment (e.g. `.env` or process environment).
Enforced by `lib/jam-admission.ts`, consumed in `app/api/runtime-ws/route.ts`.

| Variable | Default | Controls | Notes |
|----------|---------|----------|-------|
| `MAX_CONCURRENT_JAMS` | `1` | Maximum simultaneous jam sessions across all clients | Prevents multi-tab process explosions |
| `MAX_TOTAL_AGENT_PROCESSES` | `4` | Maximum total agent Codex processes across all jams | With 4 agents per jam and default limit of 1 jam, this is exactly 1 full band |

### Prompt-Layer Tuning Knobs

These are not code constants — they are editable text/content that shapes agent
behavior through the system prompt assembly pipeline.

| Knob | Location | What It Controls |
|------|----------|-----------------|
| Agent personas | `.codex/agents/{drummer,bassist,melody,chords}.md` | Per-agent personality, musical vocabulary, role constraints |
| Shared jam policy | `lib/jam-agent-shared-policy.ts` (constants `JAM_MUSICAL_POLICY_LINES`, `STRUDEL_VALIDITY_POLICY_LINES`) | Cross-agent musical policy and Strudel validity rules |
| Genre-energy guidance | `.codex/skills/genre-energy-guidance/SKILL.md` | Per-genre, per-role energy behavior at LOW/MID/HIGH bands |
| Strudel API reference | `lib/strudel-reference.md` | Valid Strudel functions, mini-notation, sound banks |
| Jam manager context templates | `lib/jam-manager-context-templates.ts` | Behavior-shaping jam-start/directive/auto-tick wording (not routing, lifecycle, or JSON schema contract) |
| Musical context presets | `lib/musical-context-presets.ts` | Starting key/BPM/energy/genre/chords for new jams |

---

## 3. Failure Triage

For general debugging gotchas (MCP build steps, `--verbose` flag, WebSocket
native addon issues, React Compiler compatibility, etc.), see the
[V2 Technical Notes quick-reference table](../v2-jam-session/technical-notes.md#quick-reference-table).

### Model-Policy Symptom Table

| Symptom | Likely Cause | Where to Look | Fix |
|---------|-------------|---------------|-----|
| BPM/energy drifts unexpectedly on auto-tick | `AUTO_TICK_DAMPENING` too high, or agents consistently returning high-confidence directional deltas | `applyModelRelativeContextDeltaForAutoTick()` in `lib/agent-process-manager.ts` | Lower `AUTO_TICK_DAMPENING`; check agent personas for energy-bias language |
| Key never changes despite agent suggestions | Fewer than 2 agents suggesting the same key with `high` confidence | `applyContextSuggestions()` in `lib/agent-process-manager.ts` | Verify agent prompts encourage key suggestions; check `normalizeSuggestedKey()` validation |
| Unexpected key changes | Two agents agreeing on a key change when not intended | Same as above | Raise consensus threshold or add prompt guidance against frequent modulation |
| Agent always returns `no_change` | Agent persona or policy too conservative; energy guidance discouraging change | Agent persona file + `lib/jam-agent-shared-policy.ts` | Review `Match change size to directive strength` policy line; ensure auto-tick prompt encourages evolution |
| Invalid JSON responses from agent | Model not following output contract; token budget exceeded | `parseAgentResponse()` in `lib/agent-process-manager.ts` | Check model choice in Codex config; verify `buildAgentTurnPrompt()` contract lines are clear |
| Deterministic anchor overrides model intent | Boss said "faster" but also included explicit BPM → explicit wins | `handleDirective()` step 1 vs step 7 | This is by design (deterministic precedence). If undesired, rephrase directive without explicit values |
| Jam start rejected | `jam_capacity_exceeded` or `agent_capacity_exceeded` | `lib/jam-admission.ts` + `app/api/runtime-ws/route.ts` | Increase `MAX_CONCURRENT_JAMS` / `MAX_TOTAL_AGENT_PROCESSES` env vars, or stop existing jams |
| Agent timeouts (15s) | Model latency too high; Codex session issues | `sendToAgentAndCollect()` timeout in `lib/agent-process-manager.ts` | Increase `AGENT_TIMEOUT_MS`; check model provider status; verify Codex auth |
| Chord progression sounds wrong after key change | `deriveChordProgression()` auto-derives minimal diatonic fallback chords (I-vi-IV-V major, i-VI-III-VII minor) on the same turn a key change is applied [C hybrid, MCP-04 / bsj-7k4.15]. These are continuity placeholders, not genre-tailored. | `deriveChordProgression()` in `lib/musical-context-parser.ts`; `applyContextSuggestions()` in `lib/agent-process-manager.ts` | Wait one turn: agents see the new key on the next auto-tick and can suggest genre-appropriate chords via `suggested_chords`. If chords remain unsuitable, adjust agent personas or shared policy to encourage earlier chord suggestions. |
| Auto-tick fires during directive | Timer not reset; `tickScheduled` coalescing failed | `startAutoTick()` / `enqueueTurn()` in `lib/agent-process-manager.ts` | Check `clearInterval` call at top of `handleDirective()` |

### Rollback Guidance

When modifying governance constants or policy text, follow these four rules
(derived from the [hardcoding audit risk section](./hardcoding-audit-bsj-7k4.8.md#risks-rollback-considerations-and-test-implications)):

1. **Keep deterministic runtime guardrails and schema validation in code
   throughout migrations.** Never move validation or clamp logic into prompts.
2. **Prefer additive extraction** (externalized text + compatibility wrapper)
   before deleting runtime constants or strings.
3. **Add or update targeted tests** before changing cue lexicon, dampening,
   consensus thresholds, or fallback behavior.
4. **Document each policy/tuning move** in `docs/v3/` so this playbook stays
   accurate and follow-up beads have stable references.

---

## 4. Adding Future Policy Without Hardcoding

### Decision Rubric

Before adding or modifying behavior, classify it:

| Category | Question to Ask | Action |
|----------|----------------|--------|
| **A** (Code) | Is this routing, schema validation, lifecycle, safety, or canonical mapping? | Keep in code. Do not move to prompts. |
| **B** (Skill/Prompt) | Is this musical interpretation text, cue vocabulary, or guidance wording? | Move to skill/prompt/policy file. Runtime only loads and injects. |
| **C** (Hybrid) | Is the shell deterministic but the values are tunable or the text is policy? | Keep the deterministic shell in code; document the tunable values in this playbook; consider externalizing text. |

### Checklist for New Tuning Knobs

- [ ] Is the new knob deterministic (clamp, threshold, multiplier)? → Keep in
      code as a named constant.
- [ ] Is the new knob musical text or guidance? → Keep in a skill/prompt file;
      load at runtime.
- [ ] Add the knob to the governance constants table in this playbook.
- [ ] Add or update a targeted test covering the knob's effect.
- [ ] If the knob affects auto-tick drift, test with multiple rounds to confirm
      stability.

### Checklist for Modifying Existing Policy

- [ ] Identify the A/B/C classification of the behavior being changed (check
      the [hardcoding audit inventory](./hardcoding-audit-bsj-7k4.8.md#abc-inventory-table-one-by-one-decisions)).
- [ ] If **A**: change only the code; do not extract to prompts.
- [ ] If **B**: change the skill/prompt source; verify runtime loader picks it
      up correctly.
- [ ] If **C**: preserve the deterministic shell; change only the tunable
      values or text.
- [ ] Document the change in `docs/v3/` and update this playbook if it affects
      operator-visible knobs.
- [ ] Run existing tests (`lib/__tests__/agent-process-manager.test.ts`,
      `lib/__tests__/musical-context-parser.test.ts`) to confirm no regression.

### Follow-Up Beads

These beads are children of `bsj-7k4` and were created during the
[hardcoding audit](./hardcoding-audit-bsj-7k4.8.md#follow-up-bead-mapping-candidate---bead-id).
They represent the planned sequence for further boundary hardening:

| Bead | Title |
|------|-------|
| `bsj-7k4.12` | ~~Fence legacy `parseMusicalContextChanges()` heuristics away from jam runtime paths~~ — **Done**: legacy monolithic parser removed entirely (`df4b86e`) |
| `bsj-7k4.13` | Broaden deterministic relative cue detection to match jam-musical-policy phrase families |
| `bsj-7k4.14` | ~~Document and centralize jam runtime governance constants (confidence, dampening, consensus)~~ — **Done**: `JAM_GOVERNANCE` object in `lib/jam-governance-constants.ts`, all inline magic numbers replaced, invariant + boundary tests added |
| `bsj-7k4.15` | ~~Codify boundary for runtime chord-progression fallback templates after key changes~~ — **Done**: docs + tests codify C-hybrid fallback boundary |
| `bsj-7k4.16` | Reduce drift in shared jam policy prompt by externalizing condensed policy text |
| `bsj-7k4.17` | Move genre-energy generic fallback guidance out of runtime code |
| `bsj-7k4.18` | Extract jam manager context/prompt phrasing templates from `AgentProcessManager` |
| `bsj-7k4.19` | Align normal-mode system prompt with `strudel-validity-policy` canonical wording |
| `bsj-7k4.20` | Fix `strudel-validity-policy` jam JSON contract wording and example drift |

See the audit doc for full rationale, risk analysis, and recommended sequencing.
