---
name: strudel-validity-policy
description: Generate Strudel with valid, canonical APIs and pattern-safe constructs in both normal and jam outputs. Use when writing or repairing patterns, especially after invalid method names, malformed chains, or JS-global misuse in pattern context.
---

# Strudel Validity Policy

Use this skill to improve first-pass Strudel validity.
This is a generation policy skill, not a hardcoded rewrite policy.

## Trigger

Use when one or more are true:

- You are generating or revising Strudel code in normal assistant mode.
- You are generating jam-agent `pattern` values.
- A runtime error implies invalid API usage (for example: "`... is not a function`" or `ReferenceError`).
- You see patterns that rely on host JS globals in the pattern expression.
- The user explicitly invokes `/strudel-validity-policy`.

## V3 Boundary Contract

Model-owned (this skill influences):

- Valid Strudel API and method selection.
- Musical content choices (groove, density, register, timbre) using valid syntax.
- Safe adaptation when confidence is low (`no_change` in jam mode when appropriate).

Code-owned (do not redefine here):

- Deterministic `@mention` routing and broadcast behavior.
- Jam schema validation, fallback behavior, and session lifecycle.
- Deterministic server-side final `stack(...)` composition.

Rule: generate canonical valid code up front. Do not rely on runtime compatibility rewrites as a primary strategy.

## Canonical API Anchors

Prefer these families as your default vocabulary:

- Sources: `note(...)`, `sound(...)`, `s(...)`, `silence`
- Structure: `stack(...)`, `cat(...)`, `seq(...)`, `fastcat(...)`, `slowcat(...)`
- Timing/variation: `.fast(...)`, `.slow(...)`, `.every(...)`, `.sometimes(...)`, `.rarely(...)`, `.often(...)`, `.euclid(...)`, `.degradeBy(...)`, `.palindrome()`, `.rev()`
- Sound design/effects: `.gain(...)`, `.pan(...)`, `.lpf(...)`, `.hpf(...)`, `.bpf(...)`, `.lpq(...)`, `.room(...)`, `.size(...)`, `.delay(...)`, `.delaytime(...)`, `.delayfeedback(...)`, `.distort(...)`, `.crush(...)`, `.coarse(...)`, `.speed(...)`, `.vowel(...)`
- Sample/synth selectors: `.n(...)`, `.bank(...)`, `.s("sine" | "square" | "sawtooth" | "triangle" | ...)`
- Modulation source: `sine` (for example: `.pan(sine.range(0,1))`)

## Canonical Mapping for Common Hallucinations

Use these as generation-time corrections:

| Invalid/hallucinated form | Canonical Strudel form |
|---|---|
| `.wave("saw")` | `.s("sawtooth")` |
| `.wave("tri")` | `.s("triangle")` |
| `.band(1000)` | `.bpf(1000)` |
| `.pan(sin)` | `.pan(sine.range(0,1))` |
| `.pan(sin(rate=2))` | `.pan(sine.slow(0.5).range(0,1))` |

Do not overfit to this table. If uncertain, favor documented methods from the shared Strudel reference rather than inventing new method names.

## Pitfalls and Preferred Patterns

1. Pitfall: Host JS globals inside pattern context (`Math.random()`, `Date.now()`, `window`, `document`, `setInterval`).
Preferred: Strudel-native variation (`?`, `.sometimes(...)`, `.rarely(...)`, `.degradeBy(...)`, `.every(...)`, `.euclid(...)`).

2. Pitfall: Method-name invention by analogy (`.wave`, `.band`, or other undeclared helpers).
Preferred: Use canonical names (`.s`, `.bpf`, `.lpf`, `.hpf`, etc.) and keep method chains inside known Strudel APIs.

3. Pitfall: Ambiguous source usage (`note(...)` with sample-bank logic, or `s(...)` used like pitched-note notation).
Preferred: `note(...)` for pitched note patterns, `s(...)`/`sound(...)` for sample/percussion patterns, then add valid modifiers.

4. Pitfall: Over-complex chain generation that increases syntax failure risk.
Preferred: Start with one valid source + two or three proven modifiers, then expand only if needed.

5. Pitfall: Jam agents composing final arrangement logic.
Preferred: Jam agents output one valid pattern (or `no_change`), while server code owns final `stack(...)` composition.

6. Pitfall: Hardcoding one-off rewrites into generation behavior.
Preferred: Apply general validity rules (canonical method names, valid chain forms, Strudel-native variation) so unseen prompts still produce valid code.

## Generation Constraints

1. Start from a valid root expression: `note(...)`, `s(...)`, `sound(...)`, `stack(...)`, `cat(...)`, `seq(...)`, or `silence`.
2. Add methods only from known Strudel vocabulary unless the method is explicitly confirmed in the reference.
3. Keep pattern expressions self-contained; avoid host-side JS globals and timer APIs in pattern logic.
4. Use function callbacks only in recognized contexts like `.every(...)` and `.sometimes(...)`.
5. Keep arguments simple and parseable (`number`, `string`, or supported pattern expression).
6. For jam output, obey JSON shape exactly: one JSON object with required keys `pattern` and `thoughts`; optional `commentary` and `decision` objects may be included when relevant.
7. If confidence is low in jam mode, prefer `no_change` over speculative invalid syntax.
8. Preserve musical intent without sacrificing validity.

## Output Examples

### Normal Mode Example

Prompt intent: "Make a darker, moving groove without breaking syntax."

```javascript
stack(
  s("bd ~ sd ~").gain(0.9),
  s("hh*8").degradeBy(0.2).hpf(600),
  note("<c2 c2 eb2 g1>").s("sawtooth").lpf("500 900 650 1100").room(0.2)
).slow(1)
```

Canonical correction pattern (compact):

```javascript
// Avoid: note("c3").wave("saw").band(1200).pan(sin)
note("c3").s("sawtooth").bpf(1200).pan(sine.range(0,1))
```

### Jam Output Example

Target: per-agent JSON response with a valid single pattern; optional `decision` metadata may be included when relevant (omitted here).

```json
{
  "pattern": "s(\"bd [~ bd] sd [bd ~]\").bank(\"RolandTR909\").gain(0.55).sometimes(x => x.fast(2))",
  "thoughts": "Kept the pocket stable, added controlled variation via sometimes-fast bursts.",
  "commentary": "Locked with the directive and staying tight with the band."
}
```

Low-confidence jam fallback that stays valid:

```json
{
  "pattern": "no_change",
  "thoughts": "Current groove already matches the directive; avoiding risky syntax changes this turn.",
  "commentary": "Holding this shape and listening for the next move."
}
```
