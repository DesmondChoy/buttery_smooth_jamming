# V3 Jam Boss Prompting Guide

This is a practical "what to say to get what reaction" guide for jam mode.

It documents the current v3 behavior from the actual runtime/parser, including:

- deterministic trigger phrases (key/BPM/energy anchors),
- relative cue phrases (faster/slower, more/less energy),
- targeted `@mention` routing,
- what changes the top bar immediately vs what evolves over time.

Use this as the operator-facing companion to:

- `docs/v3/model-policy-boundary.md` (policy + precedence)
- `lib/musical-context-parser.ts` (deterministic parser)
- `lib/agent-process-manager.ts` (routing + jam-state updates)

## Quick Start (Before Directives Will Work)

You must:

1. Start a jam session.
2. Choose a preset (genre).
3. Press `Play` (jam mode play, not just normal mode playback).

Until the preset is chosen and the jam is armed, boss directives are rejected.

## Mental Model: Three Kinds of Prompting

There are three different "prompting layers" in jam mode:

1. Deterministic anchors (code-parsed)
   These update shared jam state directly when the phrase matches.
   Examples: key changes, explicit BPM, explicit numeric energy, half/double-time.

2. Relative cues (code-detected, model-decided)
   The runtime detects phrases like `faster` or `more energy`, but the actual
   global BPM/energy change depends on agent decision blocks and confidence.

3. Creative musical direction (model-owned)
   Phrases like `make it darker`, `open it up`, `more tension`, `stay in the pocket`
   guide musical behavior, but are not deterministic menu-bar triggers.

## Broadcast vs Targeted Directives

- No `@mention` at the start = broadcast to currently active, unmuted agents.
- `@mention` at the start = targeted directive to one agent.

Supported mentions:

- `@BEAT` (drums)
- `@GROOVE` (bass)
- `@ARIA` (melody)
- `@CHORDS` (chords / comping)

Important routing rule:

- Target detection only happens when the `@mention` is at the beginning of the message.
- `@BEAT faster` targets drums.
- `faster @BEAT` does not count as targeted routing.

Important context rule:

- Targeting changes who receives the directive.
- Shared musical context (key/BPM/energy) is still global and can change from a targeted turn.

## Sub-Agent Prompt Files (Canonical References)

These files define each jam agent's role/persona, musical rules, and response style.
If you want to understand why a given agent reacts the way it does, start here:

- `../../.codex/agents/drummer.md` (BEAT / drums)
- `../../.codex/agents/bassist.md` (GROOVE / bass)
- `../../.codex/agents/melody.md` (ARIA / melody)
- `../../.codex/agents/chords.md` (CHORDS / comping + harmonic support)

Genre and energy-specific behavior is also shaped by:

- `../../.codex/skills/genre-energy-guidance/SKILL.md` (per-genre, per-role LOW/MID/HIGH energy guidance)

Important runtime note:

- The agent persona prompts are the base role instructions.
- In jam mode, the runtime also appends genre-specific energy guidance for the selected preset,
  so the same directive can produce different behavior in Funk vs Jazz vs Dark Ambient.

## Role-Specific Prompting Tips (Across Genres)

Use this section when you want better results than generic prompts like `make it better`.
The pattern that works best is:

- role target (optional but useful),
- one clear job,
- one anchor (BPM/key/energy/arrangement),
- one space constraint (`keep pocket`, `leave room`, `stay subtle`).

If you use a target `@mention`, put it first in the message so routing works.

### BEAT (`@BEAT`) - Drums / Groove Architecture

Prompt file reference:

- `../../.codex/agents/drummer.md`

What BEAT is optimized for:

- Rhythmic foundation, pocket, syncopation, fills, and transitions.
- Reacting to GROOVE's rhythm and protecting the downbeat.
- Driving tempo feel (BEAT is the best target for relative tempo cues).

What to say for better results:

- Ask for pocket and density, not just "more drums".
- Name the meter feel when it matters (`odd meter pulse`, `waltz`, `half time`).
- Add a space constraint when ARIA or CHORDS is dense (`keep it simple`, `leave room for ARIA`).

Genre-aware tips:

- Funk / Afrobeat / Latin:
  Ask for pocket language (`tight`, `syncopated`, `locked`, `on the one`) and specify whether you want more hat/percussion activity or a cleaner downbeat.
- Jazz / Blues / Waltz:
  Ask for feel and articulation (`brushes-feel`, `shuffle`, `conversational`, `clear beat 1 in 3/4`) more than raw intensity.
- Drum & Bass / Prog Rock:
  Give explicit BPM or meter cues first, then add a phrase-boundary request (`tom accents at phrase ends`, `keep the odd meter readable`).
- Lo-fi Hip Hop / Reggae:
  Ask for restraint and placement (`behind the beat`, `one-drop pocket`, `dusty`, `minimal hits`).

Prompt examples:

- `@BEAT tighter funk pocket, energy 6, keep the kick clear on the one`
- `@BEAT half time feel, but keep it moving and don't overcrowd ARIA`
- `@BEAT waltz groove, clear downbeat on 1, soft texture on 2-3`
- `@BEAT push a little faster, keep pocket, no huge jump`

### GROOVE (`@GROOVE`) - Bass / Low-End Glue

Prompt file reference:

- `../../.codex/agents/bassist.md`

What GROOVE is optimized for:

- Locking to BEAT's kick.
- Root motion, supportive harmonic grounding, and bassline contour.
- Keeping the low end stable while adapting density by energy and genre.

What to say for better results:

- Ask for relationship to the kick (`lock to BEAT`, `follow the kick`, `stay glued to the one`).
- Ask for motion style (`sustained`, `walking`, `slap`, `root-fifth`, `tumbao-like`) instead of just "play more notes".
- Use range/space language when ARIA is busy (`stay low`, `no high fills`, `leave c3-c4 space`).

Genre-aware tips:

- Funk / Afrobeat:
  Ask for syncopated root-octave movement and pocket lock. Add "dead-note feel" or "bounce" if you want more attitude without extra harmonic movement.
- Jazz / Blues:
  Ask for walking behavior, chromatic approaches, or slow root support depending on energy. Mention `shuffle` or `swing` to align articulation.
- Reggae / Dub / Lo-fi:
  Ask for sparse, sustained bass and warmth (`deep`, `round`, `minimal motion`, `dub foundation`) rather than busier phrasing.
- Prog Rock / Pop:
  Ask for counter-melody or phrase-aware movement (`follow the odd-meter phrase`, `support the hook without crowding it`).

Prompt examples:

- `@GROOVE lock harder to BEAT's kick, root-fifth motion, stay below c3`
- `@GROOVE give me a reggae-style deep foundation, minimal motion, energy 3`
- `@GROOVE walking line feel for jazz, but keep it supportive under ARIA`
- `@GROOVE more motion in the prog groove, but keep the phrase shape readable`

### ARIA (`@ARIA`) - Melody / Harmonic Direction

Prompt file reference:

- `../../.codex/agents/melody.md`

What ARIA is optimized for:

- Harmonic correctness, phrasing, motifs, and tension-release.
- Melodic placement around GROOVE and BEAT.
- Harmonic suggestions (key/progression ideas) when a change is musically justified.

What to say for better results:

- Ask for phrase shape and function (`hook`, `counterline`, `answer phrase`, `long tones`, `cadence`).
- Include a space or register constraint (`stay above GROOVE`, `short phrases`, `leave beat accents exposed`).
- If you want harmony to evolve, ask ARIA explicitly for a modulation/progression idea, then give the band a follow-up directive after it lands.

Genre-aware tips:

- Pop / Prog Rock:
  Ask for motif clarity and phrase arcs (`hook-driven`, `anthemic`, `across bar lines`, `climactic lift`).
- Jazz / Lo-fi Hip Hop:
  Ask for chord-tone phrasing, sparse motifs, and color tones with restraint (`warm`, `conversational`, `leave air`).
- Funk / Afrobeat / Latin:
  Ask for rhythmic riffs or horn-like stabs instead of long legato lines, especially at MID/HIGH energy.
- Dark Ambient / Reggae:
  Ask for fewer notes and more sustain/space (`drone-like line`, `off-beat skank support`, `haunting intervals`).

Prompt examples:

- `@ARIA give me a simple hook, stay above GROOVE, leave space on BEAT's accents`
- `@ARIA horn-like rhythmic riff for afrobeat, energy 7, no long runs yet`
- `@ARIA suggest a smooth modulation when it feels natural, then keep the phrase sparse`
- `@ARIA darker, lower-register phrase, but keep harmonic clarity`

### CHORDS (`@CHORDS`) - Comping / Harmonic Support and Contrast

Prompt file reference:

- `../../.codex/agents/chords.md`

What CHORDS is optimized for:

- Audible harmonic support: chord stabs, comping patterns, pads, and rhythm-guitar/keys style motion.
- Filling the midrange so the band feels complete without masking ARIA or GROOVE.
- Arrangement contrast through density, voicing, and occasional texture support (not primary melody leadership).

What to say for better results:

- Ask for comping function (`offbeat stabs`, `pad bed`, `skank`, `montuno`, `power-chord support`) rather than a vague \"add something\".
- Tell CHORDS where to sit in the mix (`midrange`, `above GROOVE`, `leave room for ARIA`, `short stabs only`).
- Use arrangement language (`build`, `drop`, `breakdown`, `hold`) to get cleaner, musical CHORDS moves.

Genre-aware tips:

- Funk / Afrobeat / Latin:
  Ask for interlocking stabs or repeated comping cells (`offbeat stabs`, `montuno feel`, `locked with BEAT`) and add a space constraint for ARIA.
- Jazz / Bossa Nova / Waltz:
  Ask for sparse comping language (`shell voicings`, `gentle pulses`, `leave air`, `support the dance feel`).
- Punk / Mixolydian Rock / Pop:
  Ask for power-chord support, rhythm hits, or pad beds depending energy (`drive the section`, `anthem bed`, `short attacks`).
- Lo-fi Hip Hop / Dark Ambient / Dub:
  Texture-forward requests still work - ask for harmonic beds plus restraint (`dusty pad`, `dub tails`, `no dense layer`, `just enough glue`).

Prompt examples:

- `@CHORDS tight offbeat stabs, keep them short, leave room for ARIA`
- `@CHORDS bossa comping, gentle syncopation, no busy fills`
- `@CHORDS punk power-chord support, obvious join, stay above GROOVE's lane`
- `@CHORDS lo-fi pad bed only, dusty and subtle, no dense top-end texture`

## Cross-Genre Prompting Strategy (Practical)

To get consistent results across different presets, build your message with these ingredients.
If targeting a single agent, put the `@mention` first in the final text.

Targeted-message order (literal order in the input box):

1. Role target: `@BEAT`, `@GROOVE`, `@ARIA`, `@CHORDS`
2. Deterministic anchor (if needed): `BPM 132`, `energy 6`, `Switch to A minor`
3. Genre-aware intent: `funk pocket`, `jazz brushes-feel`, `dub space`, `prog phrase accents`
4. Constraint: `keep pocket`, `leave room`, `stay subtle`, `no big jump`

Broadcast-message order (no `@mention`):

1. Deterministic anchor (if needed)
2. Genre-aware intent
3. Constraint

Template examples:

- `@BEAT BPM 128, tighter funk pocket, keep pocket, no huge fills`
- `@CHORDS energy 4, lo-fi pad bed only, subtle crackle is okay, stay out of the bass lane`
- `@ARIA Switch to D minor, sparse melodic answer phrases, leave room for GROOVE`
- `@GROOVE afrobeat bounce, lock to BEAT, more motion but keep the root clear`

## Trigger Phrase Cheat Sheet (Deterministic / Reliable)

These phrases are handled by code and can update shared jam state immediately.

### Key Change (Deterministic)

Recognized patterns include:

- `Switch to D major`
- `key of Eb minor`
- `in the key of A minor`
- `change key to G`
- `D major` (generic key mention can also match)

What happens:

- Global `key` changes.
- Global `scale` is re-derived immediately.
- Top bar key text updates after the next jam-state broadcast.

Notes:

- If quality is omitted in some patterns (for example `change key to G`), it defaults to `major`.

### BPM / Tempo (Deterministic)

Recognized explicit formats:

- `BPM 140`
- `tempo 90`
- `140 BPM`
- `140bpm`

Also recognized:

- `half time`
- `double time`

What happens:

- Global `BPM` changes immediately (bounded to runtime limits).
- If explicit BPM and half/double-time both appear, explicit BPM wins.
- Top bar BPM updates after the next jam-state broadcast.

Use these for guaranteed results:

- `BPM 140`
- `140 BPM`
- `tempo 128`

Not currently a deterministic BPM format:

- `BPM to 140`
- `tempo to 140`

Use `BPM 140` instead.

### Energy (Deterministic)

Recognized explicit formats:

- `energy 8`
- `energy to 3`

Recognized semantic extremes:

- `full energy`
- `max energy`
- `minimal`

What happens:

- Global energy changes immediately (1..10).
- Top bar energy meter (`E:` bars) updates after the next jam-state broadcast.

## Relative Cue Phrases (Detected, But Not Guaranteed Global Change)

These phrases are recognized as cues, but the final global BPM/energy update
depends on agent decisions (`tempo_delta_pct`, `energy_delta`) and confidence.

If the agent(s) choose to change feel locally without emitting a usable decision,
the top bar may not move.

### Relative Tempo Cues

Increase cues:

- `speed up`
- `faster`
- `push`
- `push it`
- `pick up`
- `nudge up`

Decrease cues:

- `slow down`
- `slower`
- `lay back`
- `ease back`
- `bring it down`

Example outcomes:

- `a bit faster` may increase BPM slightly.
- `faster` may only increase perceived intensity/density with no BPM change.
- `BPM 140 and faster` still resolves to exactly `140` (explicit BPM wins).

### Relative Energy Cues

Increase cues:

- `more energy`
- `crank it`
- `hype`
- `lift it`
- `hit harder`

Decrease cues:

- `chill`
- `chiller`
- `calm`
- `calmer`
- `less energy`
- `cool it down`
- `settle`
- `less intense`

Example outcomes:

- `more energy` may raise the global energy meter if agents return a usable decision.
- It may also just produce denser/louder patterns without moving the global meter.

## Targeted Control Phrases: Mute / Drop Out

Targeted mute-like directives are handled deterministically for the addressed agent.

Examples (use with a leading `@mention`):

- `@BEAT mute`
- `@ARIA go silent`
- `@CHORDS stop playing`
- `@GROOVE drop out`
- `@BEAT lay out`
- `@ARIA sit out`

What happens:

- The targeted agent is forced to `silence`.
- The agent is marked muted and stays muted across auto-ticks.
- A later targeted non-mute cue to that same agent counts as a re-entry request
  and un-mutes them.

Notes:

- `unmute` is intentionally not treated as a mute cue.
- A practical re-entry example is `@BEAT come back in with a tight pocket`.

## What Changes In The Top Bar (And What Does Not)

After the jam is armed (preset applied and live jam running), the top bar shows
live shared musical context rather than only the preset preview.

Can change during a jam:

- Key
- BPM
- Energy meter (`E:`)
- Chord chips (when agents suggest/derive new harmonic context)

Usually does not change during a jam:

- Genre preset chip (genre is set by the chosen preset and the preset is locked after first join)

To change genre:

1. Stop the jam.
2. Start a new jam.
3. Pick a different preset.

## Chords and Harmony: What Boss Phrases Do (And Do Not) Control

What is deterministic today:

- Boss key changes (for example `Switch to D major`)
- Key -> scale derivation

What is not deterministically parsed from boss text today:

- Explicit chord sequences / progression templates in boss directives

How chord chips can still change:

- Agents can suggest `suggested_chords` with high confidence.
- Key consensus on auto-tick can trigger auto-derived fallback chords.

Important timing nuance:

- Agent key/chord suggestions are applied during auto-tick processing (autonomous rounds),
  not currently as part of the boss directive turn path.

## Reliable Prompt Recipes (Copy/Paste)

### Guarantee a Tempo Change

- `BPM 140`
- `140 BPM`
- `@BEAT BPM 140 and keep the pocket tight` (targets drums, but BPM is still global)

### Change Key and Tempo Together

- `Switch to D major, BPM 140`
- `@ARIA switch to Eb minor, BPM 96` (targeted, but key/BPM are global)

### Force an Energy Level

- `energy 7`
- `energy to 3`
- `max energy`
- `minimal`

### Ask for a Relative Change (Flexible / Musical)

- `a bit faster, more energy, keep it locked`
- `slower and calmer, but don't lose momentum`
- `@CHORDS more energy, but stay out of ARIA's register`

Use these when you want expressive interpretation rather than a guaranteed meter jump.

## Phrases That Commonly Surprise People

These look reasonable, but do not currently map the way you might expect:

- `BPM to 140`
  Use `BPM 140` instead.

- `tempo to 128`
  Use `tempo 128` instead.

- `faster`
  This is a relative cue, not a guaranteed BPM change.

- `Change chords to Dm G C`
  Chord progression is not deterministically parsed from boss text today.

- `Switch genre to Funk` (mid-jam)
  Genre preset is a session/preset choice, not a live boss directive trigger.

## Troubleshooting: "I Said It, But Nothing Changed"

Check these first:

1. Jam not armed yet
   The UI requires a preset + jam play before directives are accepted.

2. `@mention` not at the start
   Only start-of-message mentions are routed as targeted directives.

3. Relative cue with no usable model decision
   `faster` / `more energy` may change feel locally without changing global BPM/energy.

4. You expected chords to parse deterministically
   Boss directives do not directly parse explicit chord sequences today.

5. Genre change requested mid-jam
   Genre comes from the selected preset and is effectively fixed for that jam.

## Recommended Boss Prompting Style

For best results, combine one deterministic anchor with one expressive cue:

- `BPM 132, more energy, keep the pocket tight`
- `Switch to A minor, slower, thinner texture`
- `@BEAT half time, but stay punchy`

This gives the runtime a reliable anchor while preserving musical creativity.
