# bsj-7k4.15 — Codify Chord-Progression Fallback Boundary

**Parent epic**: `bsj-7k4` (Model-driven Musical Policy via Skills)
**Classification**: C (hybrid) — MCP-04
**Runtime behavior change**: None

## Summary

`deriveChordProgression()` in `lib/musical-context-parser.ts` hardcodes two
chord templates (I-vi-IV-V for major, i-VI-III-VII for minor). The hardcoding
audit classified this as C (hybrid): the deterministic shell (deriving chords
from a key) stays code-owned, but the template choices are musical taste.

The function is only called from `applyContextSuggestions()` when 2+ agents
achieve key consensus. It serves as a **minimal continuity fallback** so the
jam has valid chords immediately after a key change. Agents can override via
`suggested_chords` on subsequent turns.

The existing behavior is sound. This bead codifies it through documentation
and tests only.

## C (Hybrid) Breakdown

| Aspect | Owner | Rationale |
|--------|-------|-----------|
| Deterministic shell: derive chords from key string | Code | Parsing, note math, enharmonic handling must be deterministic |
| Template choice: I-vi-IV-V / i-VI-III-VII | Code (documented taste) | Minimal diatonic fallback, not a creative assertion; agents override freely |
| Genre-specific chord progressions | Model (agents) | Agents suggest via `suggested_chords` in decision blocks on subsequent turns |

## What Changed

### Documentation
- Expanded JSDoc on `deriveChordProgression()` identifying C classification,
  fallback role, and agent override path
- Inline comments at `applyContextSuggestions()` call site explaining the
  continuity fallback pattern and why chord suggestions are skipped on
  key-change turns
- Boundary matrix row for "Harmonic context evolution" expanded to mention
  `deriveChordProgression()` and the fallback-then-override pattern
- Auto-tick example updated to note fallback nature
- Playbook failure triage row expanded with operator guidance
- Playbook follow-up beads table marked done

### Tests (3 new integration tests)
1. **Major key fallback**: 2 agents suggest Eb major → chords = `['Eb', 'Cm', 'Ab', 'Bb']`
2. **Minor key fallback**: 2 agents suggest A minor → chords = `['Am', 'F', 'C', 'G']`
3. **Same-turn chord skip**: Key change + chord suggestion on same turn → derived fallback wins

## Test Gap Closed

The existing test at line 1889 (`applies key change when 2+ agents suggest
the same key`) verified key and scale but did not assert on `chordProgression`.
The three new tests close this gap for both major and minor keys, and verify
the same-turn skip behavior.

## Cross-References

- [Model Policy Boundary](./model-policy-boundary.md) — boundary matrix row
- [Operator Playbook](./model-policy-playbook.md) — failure triage + follow-up beads
- [Hardcoding Audit](./hardcoding-audit-bsj-7k4.8.md) — MCP-04 classification
- [Validation Gate](./bsj-7k4.10-validation-gate.md) — epic completion checklist
- `lib/musical-context-parser.ts` — `deriveChordProgression()` implementation
- `lib/agent-process-manager.ts` — `applyContextSuggestions()` call site
- `lib/__tests__/agent-process-manager.test.ts` — 3 new integration tests
