# Hardcoding Audit (bsj-7k4.8): Musical/Policy Behavior Inventory and Migration Candidates

Parent epic: `bsj-7k4` (Model-driven Musical Policy via Skills (Jam + Runtime))

Source bead: `bsj-7k4.8` (audit / planning bead)

Status intent for this document:
- Audit hardcoded musical/policy behavior repo-wide (normal mode + jam mode)
- Classify findings as `A` (keep in code), `B` (migrate to policy/prompt/skill), or `C` (hybrid split)
- Create follow-up beads for high-value `B`/`C` candidates
- Explicitly exclude deterministic architecture invariants from migration

## Summary

This audit confirms the v3 boundary is already substantially in place:
- `bsj-7k4.6` moved jam-mode relative tempo/energy updates to model-driven structured `decision` deltas with deterministic anchors/bounds.
- `bsj-7k4.7` pruned session-added parser hardcoding and documented retained deterministic guards.
- Remaining work is mostly boundary hardening and drift reduction: legacy heuristics, runtime-embedded policy text, tunable runtime governance constants, and prompt/skill consistency.

High-value outcomes of this audit:
- Deterministic architecture invariants are explicitly carved out as `A` and excluded from migration.
- Runtime-embedded policy text and behavior-shaping prompt wording are identified as primary `B`/`C` follow-up areas.
- Follow-up beads `bsj-7k4.12` through `bsj-7k4.20` were created as small, testable slices.
- A small skill drift fix (`strudel-validity-policy` jam JSON wording + example gain alignment) was identified but `.codex/` writes are sandbox-blocked in this environment, so a dedicated docs-only follow-up bead was created.

## Scope and Methodology

Scope covered:
- Jam runtime orchestration and hardcoded policy behavior (`lib/agent-process-manager.ts`, `lib/musical-context-parser.ts`, `lib/musical-context-presets.ts`, `lib/jam-agent-shared-policy.ts`, `lib/genre-energy-guidance.ts`)
- Normal-mode/runtime event mapping and compatibility normalization (`lib/codex-process.ts`, `lib/codex-runtime-checks.ts`)
- Websocket routes and UI hooks for event/error text rewrites and transport shaping (`app/api/*ws*`, `hooks/*Terminal*`, `hooks/useJamSession.ts`)
- Prompt and skill coverage/drift (`.codex/agents/*.md`, `.codex/skills/jam-musical-policy/SKILL.md`, `.codex/skills/strudel-validity-policy/SKILL.md`, `.codex/skills/quality/SKILL.md`)
- Canonical mappings (`lib/types.ts`, `AGENT_META`) and deterministic mention parsing (`components/BossInputBar.tsx`)

Method:
1. Read v3 boundary and runtime docs (`docs/v3/model-policy-boundary.md`, `docs/v3/codex-runtime-setup.md`, `docs/v3/codex-cli-migration-implementation-plan.md`).
2. Scan repo hotspots for hardcoded musical interpretation, prompt shaping, normalization heuristics, fallback shaping, and event/error rewrites.
3. Classify each meaningful behavior using the v3 model/code boundary and architecture invariants.
4. Mark candidates already addressed or adjacent to `bsj-7k4.7` to avoid duplicate recommendations.
5. Create follow-up beads only for high-value `B`/`C` candidates.

Category definitions used in this audit:
- `A` = must stay deterministic in code (invariants, routing, schema/compatibility, lifecycle, safety, canonical mappings)
- `B` = better as skill/prompt/policy content (text or musical interpretation rules embedded in runtime)
- `C` = hybrid split (deterministic shell stays in code, but tuning/text/template policy should move or be explicitly documented)

## Do Not Migrate: Deterministic Architecture Invariants (Explicit Exclusions)

The following are explicitly excluded from migration and must remain code-owned/deterministic:

1. Dual-mode architecture (normal assistant mode + jam mode)
2. Deterministic `@mention` routing in code (not model inference)
3. Per-agent persistent Codex-backed jam sessions (session continuity / latency)
4. Server-side final `stack(...)` composition
5. Websocket broadcast-callback pattern for jam updates
6. Jam agents remain toolless unless intentionally changed (`--tools '' --strict-mcp-config`)
7. `AGENT_META` and agent key mappings remain canonical identity/routing sources
8. Deterministic parser anchors + precedence for explicit key/BPM/half-double-time/explicit energy
9. Schema validation, bounded normalization, and fallback continuity behavior
10. Protocol/event compatibility normalization for Codex CLI event variants

Key references:
- `docs/v3/model-policy-boundary.md`
- `lib/agent-process-manager.ts`
- `lib/types.ts`
- `components/BossInputBar.tsx`
- `lib/codex-process.ts`

## Prior Work Already Completed (What This Audit Does Not Re-Do)

### `bsj-7k4.6` (complete, commit `5a8f0ca`)

What changed:
- Jam-mode relative tempo/energy updates are model-driven via structured `decision` deltas (`tempo_delta_pct`, `energy_delta`) with deterministic anchors and bounds.

What this audit assumes:
- Relative delta ownership is now model-first.
- Code should retain minimal clamps/precedence, not reintroduce coarse synthetic relative heuristics.

### `bsj-7k4.7` (complete, commit `490c465`)

What changed:
- Session-added parser hardcoding was pruned.
- Retained deterministic guards were documented.

What this audit checks for (without duplicating):
- Whether any residual parser/session hardcoding remains and is intentionally bounded.
- Whether current parsing resilience or error formatting is compatibility-focused (`A`) vs behavior-shaping drift.

## A/B/C Inventory Table (One-by-One Decisions)

| ID | Category | File / Area | Hardcoded Behavior | Why (rationale) | Risk If Moved | Migration Target | `bsj-7k4.7` status | Follow-up |
|---|---|---|---|---|---|---|---|---|
| APM-01 | A | `lib/types.ts` (`AGENT_META`) + `components/BossInputBar.tsx` mention parsing | Canonical agent identities, `@mention` tokens, deterministic mention parsing | Core routing invariant; model must not infer routing | Misroutes directives / identity drift | runtime + tests + docs | not covered | none (explicit invariant) |
| APM-02 | A | `lib/agent-process-manager.ts` (`handleDirective`) | Deterministic targeted vs broadcast routing and unavailable-target `directive_error` behavior | Runtime ownership of routing and failure isolation | Incorrectly mutating unrelated agents; nondeterminism | runtime + tests | not covered | none (explicit invariant) |
| APM-03 | A | `lib/agent-process-manager.ts` (`JAM_TOOLLESS_ARGS`, per-agent session/thread resume) | Jam toollessness and persistent per-agent Codex-backed sessions | Explicit v3 architecture invariant | Tool leakage, MCP drift, latency regression | runtime + startup checks + docs | not covered | none (explicit invariant) |
| MCP-01 | B | `lib/musical-context-parser.ts` (`parseMusicalContextChanges`) | Legacy coarse relative heuristics (`+15/-15 BPM`, `+2/-2 energy`) | Direct musical interpretation heuristic; superseded by model-driven relative deltas | Reintroduces brittle synthetic movement; conflicts with `bsj-7k4.6` boundary | runtime + tests + docs | adjacent, not covered | `bsj-7k4.12` |
| MCP-02 | B | `lib/musical-context-parser.ts` (`detectRelativeMusicalContextCues`) | Narrow regex cue lexicon for relative tempo/energy phrases | Phrase interpretation coverage is policy-like; current lexicon can block valid model deltas | Valid `decision` deltas ignored when cue not recognized | runtime + tests + skill/doc alignment | not covered | `bsj-7k4.13` |
| MCP-03 | C | `lib/musical-context-parser.ts` (`parseDeterministicMusicalContextChanges`) | Regex grammar for explicit anchors, default key quality, lexical extremes (`full/max energy`, `minimal`) plus clamps | Deterministic anchors/clamps must stay code-owned; cue vocabulary and aliases are tunable policy-ish | Over-moving parsing into prompts breaks precedence and reproducibility | runtime + docs + tests | not covered | `bsj-7k4.13` (lexicon subset), remainder stays code |
| MCP-04 | C | `lib/musical-context-parser.ts` (`deriveChordProgression`) | Hardcoded major/minor fallback progression templates | Deterministic fallback may be valid, but template choice is musical policy/taste | Removing without fallback may break key-change continuity; keeping unexamined hardcodes harmony templates | docs + runtime + tests | not covered | `bsj-7k4.15` |
| MCP-05 | A | `lib/musical-context-parser.ts` (`deriveScale`, note normalization helpers) | Deterministic note normalization and scale derivation | Canonicalization/validation utility, not musical style policy | Invalid scales/keys propagate into runtime context | runtime + tests | not covered | none |
| APM-04 | A | `lib/agent-process-manager.ts` (`ARRANGEMENT_INTENT_MAP`) | Schema canonicalization for arrangement-intent synonyms | Compatibility normalization to fixed enum; does not prescribe content | Decision schema incompatibility if moved to model text | schema + runtime tests | adjacent but intentionally bounded | none |
| APM-05 | C | `lib/agent-process-manager.ts` (`DECISION_CONFIDENCE_MULTIPLIER`) | Confidence weights (`low=0`, `medium=0.5`, `high=1`) | Deterministic aggregation math stays in code, but exact weights are policy tuning | Undocumented changes alter jam drift/response behavior silently | runtime + docs + tests | not covered | `bsj-7k4.14` |
| APM-06 | C | `lib/agent-process-manager.ts` (`normalizeDecisionBlock`) | Decision field acceptance and clamp bounds (`tempo_delta_pct`, `energy_delta`, etc.) | Schema validation/clamps are code-owned, but exact ranges are tunable policy bounds | Over-relaxing breaks safety; over-tightening suppresses model autonomy | schema + runtime + tests + docs | not covered | `bsj-7k4.14` |
| APM-07 | C | `lib/agent-process-manager.ts` (`aggregateRelativeDecisionFieldForCurrentTurn`) | Direction compatibility gating, averaging, rounding strategy | Deterministic aggregator should remain code-owned; aggregation math is policy shaping | Inconsistent directive behavior / drift if moved ad hoc | runtime + tests + docs | not covered | `bsj-7k4.14` |
| APM-08 | A | `lib/agent-process-manager.ts` (`applyModelRelativeContextDeltaForDirectiveTurn`) | Apply model-relative deltas only when no deterministic anchor matched, with final clamps | This is the boundary enforcement itself (precedence + bounds) | Violates explicit tempo/energy precedence and deterministic guarantees | runtime + tests + docs | not covered | none (explicit boundary enforcement) |
| APM-09 | C | `lib/agent-process-manager.ts` (`applyModelRelativeContextDeltaForAutoTick`) | Auto-tick drift aggregation and `AUTO_TICK_DAMPENING = 0.5` | Deterministic control stays code-owned; dampening factor is tunable behavior policy | Runaway drift or overly static jams if tuned carelessly | runtime + tests + docs | not covered | `bsj-7k4.14` |
| APM-10 | C | `lib/agent-process-manager.ts` (`applyContextSuggestions`) | Key consensus threshold (`2+` high-confidence), chord suggestion gating/precedence | Deterministic arbitration must stay code-owned; thresholds and priority are policy-like | Unstable global harmony shifts or suppressed suggestions | runtime + tests + docs | not covered | `bsj-7k4.14` and `bsj-7k4.15` |
| APM-11 | C | `lib/agent-process-manager.ts` (`buildAgentSystemPrompt`) | Runtime assembly of persona + shared policy + genre guidance + Strudel reference | Runtime owns prompt assembly order and injection shell; policy content should live outside TS where possible | Losing deterministic assembly can break contract consistency; leaving text in code causes drift | runtime + prompt templates + tests | not covered | `bsj-7k4.16`, `bsj-7k4.17`, `bsj-7k4.18` |
| APM-12 | A | `lib/agent-process-manager.ts` (`buildAgentTurnPrompt`) | JSON contract and `decision` schema instruction wrapper | Runtime contract framing and schema compatibility; not musical content policy | Agent outputs drift from parser expectations | runtime + schema/tests | not covered | none |
| APM-13 | B | `lib/agent-process-manager.ts` (`sendJamStart`, `buildDirectiveContext`, `sendAutoTick`) | Behavior-shaping manager prompt wording (e.g. “free jam”, “respond with your updated pattern”, “use no_change”) | Musical behavior guidance should live in prompt/template policy, not manager internals (except contract lines) | Over-extracting can accidentally move contract-critical wording; under-extracting keeps drift risk | prompt/template + runtime wrapper + tests | not covered | `bsj-7k4.18` |
| APM-14 | C | `lib/agent-process-manager.ts` (`applyAgentResponse`) | `no_change` sentinel semantics, fallback pattern reuse, timeout reaction text/status shaping | Fallback continuity is code-owned; exact user-facing text and sentinel conventions are contract/policy-like | Moving fallback logic out of code risks continuity regressions | runtime + docs + tests | not covered | `bsj-7k4.14` (document constants/rules) / no separate bead for now |
| APM-15 | A | `lib/agent-process-manager.ts` (`composePatterns`) | Server-side `stack(...)` composition and silence filtering | Explicit architecture invariant | Breaks deterministic final merge and agent-role isolation | runtime + tests | not covered | none (explicit invariant) |
| APM-16 | A | `lib/agent-process-manager.ts` (`formatCodexErrorForLog`) | Log-only error text normalization (`message`, `param`, `code`, whitespace compaction`) | Operational diagnostics compatibility, not user-facing musical policy | Lower operator visibility if removed; low policy value | runtime | adjacent in spirit, intentionally bounded | none |
| APM-17 | A | `lib/agent-process-manager.ts` (`parseAgentResponse`) | Parsing-resilience fallback (direct JSON parse + bounded JSON extraction) without pattern rewrite | Bounded parser resilience; comments explicitly reject content rewrite | Aggressive rewrites could regress `bsj-7k4.7` goals | runtime + tests | already addressed/adjacent (7k4.7 pruned broader parser hardcoding) | none |
| JSP-01 | B | `lib/jam-agent-shared-policy.ts` | Condensed jam musical + Strudel validity policy lines embedded in TS constants | Policy text belongs closer to skills/docs; TS embedding is drift-prone | If moved carelessly, lose deterministic injection or token budgeting | prompt/skill source + runtime wrapper + tests/docs | not covered | `bsj-7k4.16` |
| GEG-01 | B | `lib/genre-energy-guidance.ts` (`GENERIC_GUIDANCE`) | Runtime-embedded generic role energy guidance text | Pure musical guidance text is policy content; runtime should only parse/load/select | Policy drift between skill and runtime fallback text | skill/prompt data + runtime fallback docs/tests | not covered | `bsj-7k4.17` |
| GEG-02 | A | `lib/genre-energy-guidance.ts` (skill parser/cache) | Startup parse/cache of skill file into deterministic runtime injection blocks | Runtime loader/caching behavior is code-owned infrastructure | Prompt assembly instability / perf regressions | runtime + tests | not covered | none |
| MCPR-01 | C | `lib/musical-context-presets.ts` (`PRESETS`, `randomMusicalContext`) | Hardcoded preset catalog (genre/key/chords/BPM/energy/time signatures) and random initialization behavior | Runtime can own preset selection; preset content is musical data/policy | Changing source without fallback/docs can break jam startup predictability | docs + runtime data source + tests | not covered | no bead (documented lower priority for this audit) |
| MCPR-02 | A | `lib/musical-context-presets.ts` (`C_MAJOR_FALLBACK`) | Deterministic fallback scale when scale derivation fails | Safety fallback/canonicalization | Broken jam start context if removed | runtime + tests | not covered | none |
| CP-01 | A | `lib/codex-process.ts` (`normalize_codex_event_type`, mapping helpers) | Event-type compatibility normalization and permissive extraction heuristics for Codex event variants | Protocol compatibility, not musical policy | Stream parsing regressions / missing events | runtime + tests | not covered | none |
| CRC-01 | A | `lib/codex-runtime-checks.ts` (reasoning effort/summary normalization) | Runtime config normalization for Codex profile reasoning settings | Operational/runtime policy, but not musical interpretation; deterministic config compatibility | Startup/config drift if moved into prompt layer | runtime + docs | not covered | none (out of musical migration scope) |
| RWS-01 | A | `app/api/runtime-ws/route.ts` | Websocket error/status copy, timing labels, jam admission orchestration, broadcast callback wiring | Transport/ops behavior is code-owned | Poor operator UX or lifecycle regressions if moved to prompts | runtime + docs | not covered | none |
| HRT-01 | A | `hooks/useRuntimeTerminal.ts` | UI-side message truncation and reconnect/status/error copy | UI presentation and connection handling, not musical policy | UI regressions/noise, not policy boundary | frontend | not covered | none |
| HJS-01 | C | `hooks/useJamSession.ts` (`DEFAULT_MUSICAL_CONTEXT`) | UI placeholder musical context before first server sync | Placeholder only, but musically visible; server state remains canonical | User confusion if placeholder diverges too far from server defaults | frontend + docs | not covered | no bead (low priority placeholder) |
| PP-01 | A | `lib/pattern-parser.ts` | Sentinel handling (`silence`, `no_change`) in pattern summary parsing/display | UI/runtime display normalization, not generation policy | Broken band-state summaries / noisy logs | runtime + tests | not covered | none |
| NMSP-01 | C | `.codex/agents/normal-mode-system-prompt.md` | Duplicated Strudel validity/relative-behavior wording can drift from `strudel-validity-policy` | Prompt policy content should align with shared skill wording | Normal-mode policy drift and inconsistent user behavior | prompt/skill docs | not covered | `bsj-7k4.19` |
| SVP-01 | B | `.codex/skills/strudel-validity-policy/SKILL.md` | Jam JSON schema wording and example values drift from runtime/jam prompts (optional `decision`, gain example) | Policy/skill content drift; easy docs-only fix | Model may suppress `decision` or learn inconsistent gain guidance | skill docs | not covered | `bsj-7k4.20` |
| QSK-01 | B | `.codex/skills/quality/SKILL.md` | No boundary-specific checklist for model-vs-code ownership drift | Process skill gap (policy-readiness checks are manual today) | Future audits may miss drift across docs/skills/runtime | skill docs/process | not covered | no bead (deferred; lower immediate unblock value) |

## Scanned But Not Meaningful Migration Candidates (Documented for Completeness)

These were reviewed but do not represent meaningful hardcoded musical/policy behavior for `bsj-7k4.8`:
- `app/api/ai-ws/route.ts` (provider-neutral alias to runtime websocket route)
- `hooks/useAiTerminal.ts` / `hooks/useCodexTerminal.ts` (aliases)
- `app/api/ws/route.ts` (MCP bridge websocket transport)

Rationale: compatibility/transport shims only, no musical interpretation or policy-shaping behavior.

## High-Value B/C Candidates (Priority Set for Follow-Up Beads)

Top high-value items from this audit:
1. Legacy jam-adjacent coarse relative heuristics in `parseMusicalContextChanges()` (`MCP-01`)
2. Narrow relative cue lexicon that can suppress model decisions (`MCP-02`, `MCP-03` subset)
3. Undocumented tunable runtime governance constants (confidence, dampening, consensus/gating) (`APM-05` through `APM-10`)
4. Runtime-embedded shared jam policy text (`JSP-01`) and generic genre-energy fallback text (`GEG-01`)
5. Manager prompt wording embedded in runtime code (`APM-13`)
6. Normal-mode prompt validity drift (`NMSP-01`)
7. Skill/prompt contract drift in `strudel-validity-policy` (`SVP-01`, tracked as docs-only follow-up `bsj-7k4.20` due `.codex` sandbox write block)
8. Chord progression fallback template ownership ambiguity (`MCP-04`)

## Recommended Migration Sequencing (Directly Usable by `bsj-7k4.9` / playbook work)

Recommended sequence after this audit:

1. Policy drift quick wins (docs/skills/prompts)
- Fix `SVP-01` skill contract/example drift (`bsj-7k4.20`)
- Align normal-mode prompt wording with canonical Strudel validity policy (`bsj-7k4.19`)

2. Preserve `bsj-7k4.6` boundary by fencing legacy heuristics
- Fence/deprecate coarse relative parser heuristics from jam paths (`bsj-7k4.12`)
- Broaden deterministic cue detection without reintroducing synthetic deltas (`bsj-7k4.13`)

3. Make tunable runtime governance explicit before larger prompt extraction
- Document/centralize confidence, dampening, and consensus/gating constants (`bsj-7k4.14`)
- Clarify harmonic fallback template ownership (`bsj-7k4.15`)

4. Reduce runtime-embedded policy text drift
- Externalize/generate condensed shared jam policy + coverage checks (`bsj-7k4.16`)
- Move or constrain generic genre-energy fallback guidance (`bsj-7k4.17`)
- Extract manager prompt phrasing templates while keeping deterministic contract lines in code (`bsj-7k4.18`)

5. Use this audit as source material for docs/playbook updates
- `bsj-7k4.9` should consume the invariants list, governance-constant inventory, and migration map from this doc

## Follow-Up Bead Mapping (Candidate -> Bead ID)

All new beads are children of `bsj-7k4` and were created with `discovered-from:bsj-7k4.8` dependencies.

| Candidate(s) | Bead ID | Title | Why this slice exists |
|---|---|---|---|
| `MCP-01` | `bsj-7k4.12` | Fence legacy `parseMusicalContextChanges()` heuristics away from jam runtime paths | Prevent regression to coarse synthetic relative tempo/energy behavior after `bsj-7k4.6` |
| `MCP-02`, `MCP-03` (cue-lexicon subset) | `bsj-7k4.13` | Broaden deterministic relative cue detection to match jam-musical-policy phrase families | Improves directive cue coverage so valid model `decision` deltas are not ignored |
| `APM-05` through `APM-10`, `APM-14` (rule documentation subset) | `bsj-7k4.14` | Document and centralize jam runtime governance constants (confidence, dampening, consensus) | Makes deterministic-but-tunable behavior explicit, reviewable, and playbook-friendly |
| `MCP-04`, `APM-10` (harmony gating overlap) | `bsj-7k4.15` | Codify boundary for runtime chord-progression fallback templates after key changes | Resolves ambiguity around code-owned harmonic templates vs minimal fallback |
| `JSP-01` (+ policy coverage checks) | `bsj-7k4.16` | Reduce drift in shared jam policy prompt by externalizing condensed policy text and adding coverage checks | Prevents docs/skills/runtime boundary drift while preserving deterministic prompt injection shell |
| `GEG-01` | `bsj-7k4.17` | Move genre-energy generic fallback guidance out of runtime code (or constrain to emergency fallback) | Removes pure musical guidance text from runtime internals |
| `APM-13` (+ `APM-11` prompt text split) | `bsj-7k4.18` | Extract jam manager context/prompt phrasing templates from `AgentProcessManager` | Reduces runtime policy wording while preserving contract/lifecycle ownership |
| `NMSP-01` | `bsj-7k4.19` | Align normal-mode system prompt with `strudel-validity-policy` canonical wording | Reduces drift in normal-mode validity policy guidance |
| `SVP-01` | `bsj-7k4.20` | Fix `strudel-validity-policy` jam JSON contract wording and example drift | Docs-only drift fix was identified during audit, but `.codex/` is write-blocked in this sandbox, so it is tracked as a small follow-up bead |
| `MCPR-01`, `HJS-01`, `QSK-01` | no bead (documented defer) | Lower-priority or process-only follow-up | Captured for `bsj-7k4.9`/future triage; not required to unblock current playbook docs |

## Risks, Rollback Considerations, and Test Implications

### Risks if future migrations are done without boundary discipline

1. Reintroducing synthetic relative heuristics in jam paths
- Risk: undermines `bsj-7k4.6` model-driven relative decision flow and causes tempo/energy overshoot regressions.

2. Moving deterministic routing/schema/lifecycle behavior into prompts
- Risk: non-deterministic routing, broken session continuity, and parse/contract failures.

3. Externalizing policy text without preserving deterministic prompt assembly order
- Risk: silent behavioral drift due to prompt composition changes rather than code changes.

4. Tuning governance constants without tests/docs
- Risk: changes feel like "random jam behavior regressions" and are hard to debug in operator playbooks.

### Rollback guidance (for future follow-up beads)

1. Keep deterministic runtime guardrails and schema validation in code throughout migrations.
2. Prefer additive extraction (externalized text + compatibility wrapper) before deleting runtime constants/strings.
3. Add or update targeted tests before changing cue lexicon, dampening, consensus, or fallback behavior.
4. Document each policy/tuning move in `docs/v3/` so `bsj-7k4.9` playbook can point to stable knobs.

### Test implications (by follow-up theme)

1. Cue lexicon / parser changes (`bsj-7k4.12`, `bsj-7k4.13`)
- Add/update parser unit tests for positive/negative cue matching and precedence.
- Regression tests ensuring no jam path falls back to `+15/+2` synthetic heuristics.

2. Governance constants / harmonic fallback boundary (`bsj-7k4.14`, `bsj-7k4.15`)
- Add deterministic aggregation tests for confidence multipliers, dampening, and suggestion gating.
- Add boundary tests for key/chord suggestion application behavior.

3. Prompt/policy extraction and drift checks (`bsj-7k4.16`, `bsj-7k4.17`, `bsj-7k4.18`, `bsj-7k4.19`)
- Add lightweight coverage tests or lint-like checks that critical boundary clauses and schema expectations remain aligned.
- Preserve prompt assembly order tests where runtime wrappers remain code-owned.

## `bsj-7k4.9` Handoff Notes (Docs / Playbook Unblock)

This audit is intentionally shaped to feed `bsj-7k4.9` directly.

Use this document for `bsj-7k4.9` sections on:
1. Model-owned vs code-owned decisions (reuse the `A` vs `B/C` framing)
2. Operator tuning knobs (pull from `APM-05` through `APM-10` inventory rows and `bsj-7k4.14`)
3. Failure triage and rollback boundaries (reuse risk/rollback/test sections)
4. Guidance for adding future policy behavior without hardcoding (reuse category rubric + follow-up sequencing)

Suggested playbook cross-links for `bsj-7k4.9`:
- `docs/v3/model-policy-boundary.md` (canonical boundary)
- this audit (`docs/v3/hardcoding-audit-bsj-7k4.8.md`) for concrete inventory and migration candidates
- follow-up beads `bsj-7k4.12` through `bsj-7k4.20` for implementation sequencing
