/**
 * Centralized jam runtime governance constants.
 *
 * These are the tunable policy knobs that control how the jam runtime
 * clamps, dampens, and gates musical context changes. Every constant
 * is documented with its purpose, the effect of changing it, and a
 * pointer to the operator playbook for broader context.
 *
 * See: docs/v3/model-policy-playbook.md § 2 — Operator Tuning Knobs
 *
 * NOT included here (structural/schema constants, not governance):
 *   ARRANGEMENT_INTENT_MAP, AGENT_KEY_TO_FILE, JAM_TOOLLESS_ARGS,
 *   DECISION_CONFIDENCE_SET
 */
import type { DecisionConfidence } from './types';

export const JAM_GOVERNANCE = {
  // ─── Confidence ────────────────────────────────────────────────────
  /**
   * Weights applied to agent decisions based on self-reported confidence.
   *
   * - `low: 0`   — low-confidence deltas are zeroed out entirely.
   * - `medium: 0.5` — medium-confidence agents drive half-strength changes.
   * - `high: 1`  — full weight; model's delta is applied as-is.
   *
   * Raising `low` above 0 lets uncertain agents move context.
   * Lowering `high` below 1 partially mutes confident agents.
   *
   * See: docs/v3/model-policy-playbook.md § 2 — DECISION_CONFIDENCE_MULTIPLIER
   */
  CONFIDENCE_MULTIPLIER: {
    low: 0,
    medium: 0.5,
    high: 1,
  } as Record<DecisionConfidence, number>,

  // ─── Per-Turn Clamps ───────────────────────────────────────────────
  /**
   * Maximum relative tempo swing per turn (percentage).
   * Clamped in `normalizeDecisionBlock()` before aggregation.
   *
   * Widening allows larger per-turn BPM jumps; narrowing limits
   * how fast tempo can change in a single round.
   *
   * See: docs/v3/model-policy-playbook.md § 2 — tempo_delta_pct bounds
   */
  TEMPO_DELTA_PCT_MIN: -50,
  TEMPO_DELTA_PCT_MAX: 50,

  /**
   * Maximum energy swing per turn (on the 1-10 scale).
   * Clamped in `normalizeDecisionBlock()` before aggregation.
   *
   * Widening allows jarring energy jumps; narrowing limits
   * how fast energy can change in a single round.
   *
   * See: docs/v3/model-policy-playbook.md § 2 — energy_delta bounds
   */
  ENERGY_DELTA_MIN: -3,
  ENERGY_DELTA_MAX: 3,

  // ─── Final Clamps ─────────────────────────────────────────────────
  /**
   * Hard bounds on the final BPM value after all deltas are applied.
   * Used in `parseDeterministicMusicalContextChanges()`,
   * `applyModelRelativeContextDeltaForDirectiveTurn()`, and
   * `applyModelRelativeContextDeltaForAutoTick()`.
   *
   * Outside [60, 300] produces unmusical results.
   *
   * See: docs/v3/model-policy-playbook.md § 2 — BPM clamp
   */
  BPM_MIN: 60,
  BPM_MAX: 300,

  /**
   * Hard bounds on the final energy value.
   * Fixed UI scale — changing breaks UI and prompt assumptions.
   *
   * See: docs/v3/model-policy-playbook.md § 2 — Energy clamp
   */
  ENERGY_MIN: 1,
  ENERGY_MAX: 10,

  // ─── Drift Control ────────────────────────────────────────────────
  /**
   * Multiplier applied to averaged auto-tick tempo/energy drift.
   * Halves the averaged deltas to prevent runaway autonomous evolution.
   *
   * Higher → faster autonomous evolution, potential runaway drift.
   * Lower → more stable but potentially static jams.
   * Must be in (0, 1] — zero would freeze all autonomous evolution.
   *
   * See: docs/v3/model-policy-playbook.md § 2 — AUTO_TICK_DAMPENING
   */
  AUTO_TICK_DAMPENING: 0.5,

  /**
   * Time in milliseconds between autonomous evolution rounds.
   * Timer is reset after each directive.
   *
   * Higher → slower evolution, longer static stretches.
   * Lower → faster evolution, more API calls, potential rate limits.
   *
   * See: docs/v3/model-policy-playbook.md § 2 — Auto-tick interval
   */
  AUTO_TICK_INTERVAL_MS: 30_000,

  // ─── Commentary (Display-Only) ─────────────────────────────────────
  /**
   * Maximum number of characters to broadcast in optional agent commentary.
   * Commentary is UX-only; truncation protects the jam columns from verbose
   * or runaway prose while keeping musical turns unaffected.
   */
  COMMENTARY_MAX_CHARS: 180,

  /**
   * Minimum round spacing between auto-tick commentary emissions per agent.
   * Jam-start and boss directives bypass this cooldown.
   */
  COMMENTARY_AUTO_TICK_MIN_ROUNDS: 2,

  /**
   * Number of recent normalized commentary signatures kept per agent for
   * duplicate suppression.
   */
  COMMENTARY_RECENT_SIGNATURE_WINDOW: 3,

  // ─── Consensus ────────────────────────────────────────────────────
  /**
   * Minimum number of agents (with `high` confidence) that must agree
   * on a key change for it to be applied.
   *
   * Lowering to 1 risks whiplash key changes from a single agent.
   * Raising above active agent count makes key modulation impossible.
   *
   * See: docs/v3/model-policy-playbook.md § 2 — Key consensus threshold
   */
  KEY_CONSENSUS_MIN_AGENTS: 2,

  // ─── Lifecycle ────────────────────────────────────────────────────
  /**
   * Maximum wait time for a single agent turn response.
   *
   * Higher → more tolerance for slow models, but longer perceived lag.
   * Lower → faster failure detection, but may cut off valid slow responses.
   *
   * See: docs/v3/model-policy-playbook.md § 2 — AGENT_TIMEOUT_MS
   */
  AGENT_TIMEOUT_MS: 15_000,
} as const;
