---
name: jam-musical-policy
description: Interpret jam boss directives into nuanced tempo, energy, and arrangement intent while preserving creativity-first musical autonomy and v3 deterministic boundaries. Use when jam agents need phrase-to-intent guidance, anti-overshoot behavior, and precedence-safe tempo decisions.
---

# Jam Musical Policy

Use this skill to translate boss language into musical intent in jam mode.
This is a policy skill, not a rigid composition template.

## Trigger

Use when one or more are true:

- The directive uses relative or nuanced language (for example: "a bit faster", "more energy but keep pocket", "make it darker")
- The turn requires interpreting tempo, energy, or arrangement intent
- Multiple cues conflict and need continuity-first resolution
- The user explicitly invokes `/jam-musical-policy`

Do not use this skill to decide routing, session ownership, websocket behavior, or server composition.

## V3 Boundary Contract

Model-owned musical autonomy:

- Nuanced directive interpretation and expressive realization
- Groove, density, articulation, timbre, and phrasing choices
- Micro-arrangement evolution across rounds

Code-owned deterministic guarantees:

- Deterministic `@mention` routing and broadcast behavior
- Explicit parser/context anchors, bounds, and precedence enforcement
- Session lifecycle, turn serialization, canonical jam state, and fallback handling
- Schema validation and deterministic server-side final `stack(...)` composition

Rule: preserve this boundary. Keep creative choices model-owned and runtime guarantees code-owned.

## Tempo Resolution Order (Required)

Always resolve tempo in this exact precedence:

1. Explicit BPM
2. Half/double time
3. Model-relative tempo intent

Written explicitly: `explicit BPM > half/double time > model-relative tempo intent`.

Additional rules:

- If explicit BPM and half/double-time language both appear, explicit BPM wins.
- Relative tempo language (`faster`, `slower`, `push`, `lay back`) applies only when no explicit BPM or half/double-time match exists.
- If confidence is low, hold current tempo/context (`no_change` is valid).

## Phrase-to-Intent Guidance

Interpret phrase strength before deciding magnitude. Continuity and pocket come first.

### Tempo

| Phrase strength | Example phrases | Intent realization |
|---|---|---|
| Gentle | "a bit faster", "nudge up", "ease back" | Small perceived shift; prefer subdivision/accent/articulation moves before large BPM changes |
| Medium | "push it", "pick up", "bring it down" | Clear movement with controlled deltas and groove stability |
| Strong | "way faster", "hard pullback", "half time now" | Large shift only when wording is explicit/strong; keep downbeat clarity |
| Pocket-protecting modifiers | "keep pocket", "don't rush", "stay locked" | Cap abrupt jumps; maintain rhythmic cohesion over raw speed |

### Energy

| Phrase type | Example phrases | Intent realization by role |
|---|---|---|
| Raise energy | "more energy", "lift it", "hit harder" | Drums: accent/density contrast; Bass: drive/register pressure; Melody: contour/tension; FX: motion depth/rate |
| Lower energy | "cool it down", "settle", "less intense" | Reduce density first, then soften attack and motion |
| Controlled lift | "more energy but keep pocket" | Increase one expressive dimension while keeping core groove stable |
| Extremes | "max energy", "minimal" | Strong but coherent shifts; avoid one-turn overcorrection |

### Arrangement

| Directive | Intent |
|---|---|
| "build", "lift", "open up" | Staged layering and rising tension |
| "drop", "hit" | Coordinated contrast moment and impact timing |
| "breakdown", "strip back", "thin out" | Subtractive simplification with groove identity preserved |
| "bring X forward" | Feature target role and reduce competing density elsewhere |
| "hold", "keep it here" | Continuity-first sustain with subtle internal variation |

## Anti-Overshoot Guidance

1. Match change magnitude to wording strength; subtle language should produce subtle deltas.
2. Prefer one primary move per turn; secondary changes should be supportive.
3. Ramp large relative changes over multiple rounds unless the directive is explicitly immediate.
4. Avoid simultaneous extreme tempo and energy jumps unless explicitly requested.
5. When ambiguous or low confidence, choose continuity-first behavior (`no_change` or minimal delta), not a hard reset.

## Creativity-First Behavior

1. Start from intent, then invent role-specific realization.
2. Keep musical responses fresh across rounds; do not reuse one fixed mechanic.
3. Use Strudel capabilities broadly as a substrate, not as a narrow recipe list.
4. Maintain role boundaries (drums, bass, melody, FX) while maximizing expressive freedom inside each role.

## Warning: Avoid Style/Template Lock-In

- Examples are anchors, not templates.
- Do not map phrases to one invariant pattern formula.
- Do not collapse recurring directives into a single house style.
- Vary strategy across groove, timbre, density, and phrasing while staying coherent.

## Progressive Disclosure and Token Budget

Use a three-pass policy and stop at the smallest sufficient depth:

1. Fast pass (default): detect anchors, apply precedence, choose primary move.
2. Standard pass: add only role-specific details for dimensions that changed.
3. Deep pass: brief conflict/ambiguity rationale only when needed.

Token discipline:

- Keep outputs concise by default.
- Expand reasoning only for conflicts, uncertainty, or explicit request.
- Spend tokens on actionable intent translation, not long prose.

## Quick Self-Check

- Precedence honored: `explicit BPM > half/double time > model-relative tempo intent`
- Model-owned creativity preserved; code-owned determinism not redefined
- Tempo, energy, and arrangement intent all resolved with phrase strength sensitivity
- Anti-overshoot and continuity safeguards applied
- No style/template lock-in introduced
