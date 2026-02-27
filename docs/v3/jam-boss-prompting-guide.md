# V3 Jam Boss Prompting Guide

A practical "what to say to get what reaction" guide for jam mode, documenting current v3 behavior from the actual runtime/parser: deterministic trigger phrases, relative cue phrases, targeted `@mention` routing, and what changes the top bar immediately vs over time.

Companion docs: `docs/v3/model-policy-boundary.md` | `lib/musical-context-parser.ts` | `lib/agent-process-manager.ts`

## Quick Start

You must: (1) start a jam session, (2) choose a preset (genre), (3) press Play (jam mode play, not normal mode playback). Until the preset is chosen and the jam is armed, boss directives are rejected.

## Mental Model: Three Prompting Layers

| Layer | Mechanism | Examples |
|-------|-----------|----------|
| **Deterministic anchors** | Code-parsed, updates jam state directly | Key changes, explicit BPM, numeric energy, half/double-time |
| **Relative cues** | Code-detected, model-decided | `faster`, `more energy` — actual change depends on agent confidence |
| **Creative direction** | Model-owned | `make it darker`, `more tension`, `stay in the pocket` — guides behavior, not a menu-bar trigger |

## Broadcast vs Targeted Directives

| Mention | Routing |
|---------|---------|
| `@BEAT` | Drums |
| `@GROOVE` | Bass |
| `@ARIA` | Melody |
| `@CHORDS` | Chords / comping |
| *(no mention)* | Broadcast to all active, unmuted agents |

**Routing rules:** Target detection only works when the `@mention` is at the **beginning** of the message (`@BEAT faster` = targeted; `faster @BEAT` = broadcast). Shared musical context (key/BPM/energy) is always global, even from a targeted turn.

## Glossary for Non-Musicians

| Term | Meaning | How to Ask |
|------|---------|------------|
| Pocket / Locked in | Playing tightly with the drum beat | "steady", "reliable rhythm" |
| Syncopation / Bouncy | Rhythms hitting between main beats | "funk", "latin", "upbeat groove" |
| Half-time | Feels twice as slow (BPM unchanged) | `half time` |
| Double-time | Feels twice as fast | `double time` |
| Walking Bass | Continuous stream of bass notes moving up/down | "walking line" (jazz) |
| Arpeggio | Chord notes played one by one | "arpeggiated", "flowing" |
| Pad / Bed | Long, smooth background sound (synths, strings) | "pad", "bed", "atmospheric" |
| Stabs / Hits | Short, sharp, punchy chords | "stabs", "hits", "punchy" |
| Motif / Hook | Short catchy repeating musical idea | "hook", "motif", "catchy" |
| Staccato / Legato | Short-choppy vs smooth-overlapping | "staccato", "legato" |

## What Can Strudel Do? (For Non-Musicians)

The AI agents write code in **Strudel**, an advanced code-based synthesizer. You can prompt agents to use its capabilities directly:

| Category | What to Say | Strudel Feature |
|----------|-------------|-----------------|
| Echo/Delay | "Add echo", "dub delay" | Delay effects |
| Reverb | "Spacious", "big room verb", "cavernous" | Reverb |
| Distortion | "Add distortion", "bitcrush", "crunch" | Distort / crush |
| Filters | "Muffle the sound" (low-pass), "thin/tinny" (high-pass) | LP/HP filters |
| Complex rhythms | "Mathematical rhythms", "tribal polyrhythms" | `euclid` function |
| Reverse | "Play melody backwards" | `rev` |
| Randomness | "Randomize hi-hats", "change it up 50%" | `sometimesBy` |
| Speed tricks | "Slow melody by half", "play twice as fast" | `slow` / `fast` |
| Vintage drums | "808", "909", "lo-fi drums" | Built-in drum machines |
| Synths | "Sine waves" (smooth), "sawtooth" (buzzy), "square" (hollow) | Oscillators |
| Realistic sounds | "Piano", "acoustic bass", "strings", "vibraphone" | Soundfonts |

## Sub-Agent Prompt Files (Canonical References)

| Agent | Prompt File |
|-------|-------------|
| BEAT (drums) | `../../.codex/agents/drummer.md` |
| GROOVE (bass) | `../../.codex/agents/bassist.md` |
| ARIA (melody) | `../../.codex/agents/melody.md` |
| CHORDS (comping) | `../../.codex/agents/chords.md` |
| Genre/energy guidance | `../../.codex/skills/genre-energy-guidance/SKILL.md` |

The agent persona prompts are base role instructions. In jam mode, the runtime also appends genre-specific energy guidance for the selected preset, so the same directive can produce different behavior in Funk vs Jazz vs Dark Ambient.

## Role-Specific Prompting Tips

Best prompt pattern: role target (optional) + one clear job + one anchor (BPM/key/energy) + one space constraint (`keep pocket`, `leave room`, `stay subtle`). Put `@mention` first so routing works.

### BEAT (`@BEAT`) — Drums / Groove Architecture

**Optimized for:** Rhythmic foundation, pocket, syncopation, fills, transitions. Reacts to GROOVE's rhythm, protects the downbeat. Best target for relative tempo cues.

**Tips:** Ask for pocket and density (not just "more drums"). Name the meter feel when it matters. Add space constraints when ARIA or CHORDS is dense.

| Genre | What to Ask For |
|-------|----------------|
| Funk / Afrobeat / Latin | Pocket language: `tight`, `syncopated`, `locked`, `on the one`. Specify hat/percussion activity vs cleaner downbeat |
| Jazz / Blues / Waltz | Feel and articulation: `brushes-feel`, `shuffle`, `conversational`, `clear beat 1 in 3/4` |
| Drum & Bass / Prog Rock | Explicit BPM/meter cues first, then phrase boundaries: `tom accents at phrase ends`, `keep odd meter readable` |
| Lo-fi Hip Hop / Reggae | Restraint and placement: `behind the beat`, `one-drop pocket`, `dusty`, `minimal hits` |

**Examples:**
- `@BEAT tighter funk pocket, energy 6, keep the kick clear on the one`
- `@BEAT half time feel, but keep it moving and don't overcrowd ARIA`
- `@BEAT waltz groove, clear downbeat on 1, soft texture on 2-3`
- `@BEAT push a little faster, keep pocket, no huge jump`

### GROOVE (`@GROOVE`) — Bass / Low-End Glue

**Optimized for:** Locking to BEAT's kick. Root motion, harmonic grounding, bassline contour. Stable low end with density adapted by energy/genre.

**Tips:** Ask for kick relationship (`lock to BEAT`, `follow the kick`). Ask for motion style (`sustained`, `walking`, `slap`, `root-fifth`, `tumbao-like`). Use range language when ARIA is busy (`stay low`, `no high fills`).

| Genre | What to Ask For |
|-------|----------------|
| Funk / Afrobeat | Syncopated root-octave movement, pocket lock. "Dead-note feel" or "bounce" for attitude |
| Jazz / Blues | Walking behavior, chromatic approaches, or slow root support. Mention `shuffle`/`swing` |
| Reggae / Dub / Lo-fi | Sparse sustained bass: `deep`, `round`, `minimal motion`, `dub foundation` |
| Prog Rock / Pop | Counter-melody or phrase-aware movement: `follow odd-meter phrase`, `support hook without crowding` |

**Examples:**
- `@GROOVE lock harder to BEAT's kick, root-fifth motion, stay below c3`
- `@GROOVE give me a reggae-style deep foundation, minimal motion, energy 3`
- `@GROOVE walking line feel for jazz, but keep it supportive under ARIA`
- `@GROOVE more motion in the prog groove, but keep the phrase shape readable`

### ARIA (`@ARIA`) — Melody / Harmonic Direction

**Optimized for:** Harmonic correctness, phrasing, motifs, tension-release. Melodic placement around GROOVE and BEAT. Key/progression suggestions when musically justified.

**Tips:** Ask for phrase shape (`hook`, `counterline`, `answer phrase`, `long tones`). Include register constraints (`stay above GROOVE`, `short phrases`). For harmonic evolution, ask ARIA for a modulation idea, then follow up with a band-wide directive.

| Genre | What to Ask For |
|-------|----------------|
| Pop / Prog Rock | Motif clarity and phrase arcs: `hook-driven`, `anthemic`, `across bar lines`, `climactic lift` |
| Jazz / Lo-fi Hip Hop | Chord-tone phrasing, sparse motifs: `warm`, `conversational`, `leave air` |
| Funk / Afrobeat / Latin | Rhythmic riffs or horn-like stabs instead of long legato lines |
| Dark Ambient / Reggae | Fewer notes, more sustain/space: `drone-like line`, `off-beat skank`, `haunting intervals` |

**Examples:**
- `@ARIA give me a simple hook, stay above GROOVE, leave space on BEAT's accents`
- `@ARIA horn-like rhythmic riff for afrobeat, energy 7, no long runs yet`
- `@ARIA suggest a smooth modulation when it feels natural, then keep the phrase sparse`
- `@ARIA darker, lower-register phrase, but keep harmonic clarity`

### CHORDS (`@CHORDS`) — Comping / Harmonic Support

**Optimized for:** Chord stabs, comping patterns, pads, rhythm-guitar/keys. Fills the midrange without masking ARIA or GROOVE. Arrangement contrast through density and voicing.

**Tips:** Ask for comping function (`offbeat stabs`, `pad bed`, `skank`, `montuno`, `power-chord support`). Specify mix placement (`midrange`, `above GROOVE`, `leave room for ARIA`). Use arrangement language (`build`, `drop`, `breakdown`, `hold`).

| Genre | What to Ask For |
|-------|----------------|
| Funk / Afrobeat / Latin | Interlocking stabs or comping cells: `offbeat stabs`, `montuno feel`, `locked with BEAT` + space constraint for ARIA |
| Jazz / Bossa Nova / Waltz | Sparse comping: `shell voicings`, `gentle pulses`, `leave air`, `support the dance feel` |
| Punk / Rock / Pop | Power-chord support, rhythm hits, or pad beds: `drive the section`, `anthem bed`, `short attacks` |
| Lo-fi / Dark Ambient / Dub | Harmonic beds + restraint: `dusty pad`, `dub tails`, `no dense layer`, `just enough glue` |

**Examples:**
- `@CHORDS tight offbeat stabs, keep them short, leave room for ARIA`
- `@CHORDS bossa comping, gentle syncopation, no busy fills`
- `@CHORDS punk power-chord support, obvious join, stay above GROOVE's lane`
- `@CHORDS lo-fi pad bed only, dusty and subtle, no dense top-end texture`

## Cross-Genre Prompting Strategy

Build your message in this order. Put `@mention` first if targeting a single agent.

**Targeted:** `@mention` → deterministic anchor → genre-aware intent → constraint
**Broadcast:** deterministic anchor → genre-aware intent → constraint

**Template examples:**
- `@BEAT BPM 128, tighter funk pocket, keep pocket, no huge fills`
- `@CHORDS energy 4, lo-fi pad bed only, subtle crackle is okay, stay out of the bass lane`
- `@ARIA Switch to D minor, sparse melodic answer phrases, leave room for GROOVE`
- `@GROOVE afrobeat bounce, lock to BEAT, more motion but keep the root clear`

## Trigger Phrase Cheat Sheet (Deterministic)

These are handled by code and update shared jam state immediately.

### Key Change

| Pattern | Example |
|---------|---------|
| `Switch to {note} {quality}` | `Switch to D major` |
| `key of {note} {quality}` | `key of Eb minor` |
| `in the key of {note} {quality}` | `in the key of A minor` |
| `change key to {note}` | `change key to G` (defaults to major) |
| `{note} {quality}` (generic) | `D major` |

Updates global key and scale immediately. Top bar updates after the next jam-state broadcast.

### BPM / Tempo

| Pattern | Example | Notes |
|---------|---------|-------|
| `BPM {n}` | `BPM 140` | Guaranteed |
| `{n} BPM` | `140 BPM` | Guaranteed |
| `{n}bpm` | `140bpm` | Guaranteed |
| `tempo {n}` | `tempo 90` | Guaranteed |
| `half time` | `half time` | Halves perceived tempo |
| `double time` | `double time` | Doubles perceived tempo |
| `BPM to {n}` | `BPM to 140` | **Not recognized** — use `BPM 140` |
| `tempo to {n}` | `tempo to 140` | **Not recognized** — use `tempo 140` |

If explicit BPM and half/double-time both appear, explicit BPM wins.

### Energy

| Pattern | Example | Result |
|---------|---------|--------|
| `energy {n}` | `energy 8` | Sets energy to 8 |
| `energy to {n}` | `energy to 3` | Sets energy to 3 |
| `full energy` / `max energy` | `max energy` | Sets energy to 10 |
| `minimal` | `minimal` | Sets energy to 1 |

Global energy changes immediately (1..10). Top bar `E:` bars update after next jam-state broadcast.

## Relative Cue Phrases (Not Guaranteed)

These are recognized as cues, but the final global update depends on agent decisions and confidence. The top bar may not move if agents change feel locally without emitting a usable decision.

| Direction | Tempo Cues | Energy Cues |
|-----------|-----------|-------------|
| **Increase** | `speed up`, `faster`, `push`, `push it`, `pick up`, `nudge up` | `more energy`, `crank it`, `hype`, `lift it`, `hit harder` |
| **Decrease** | `slow down`, `slower`, `lay back`, `ease back`, `bring it down` | `chill`, `chiller`, `calm`, `calmer`, `less energy`, `cool it down`, `settle`, `less intense` |

**Important:** `a bit faster` may nudge BPM slightly. `faster` alone may only increase density. `BPM 140 and faster` resolves to exactly 140 (explicit wins). Same applies to energy cues — they may produce denser patterns without moving the global meter.

## Mute / Drop Out (Deterministic)

Targeted mute directives are handled deterministically. The agent is forced to silence and stays muted across auto-ticks.

| Phrase | Effect |
|--------|--------|
| `@AGENT mute` | Silence + muted flag |
| `@AGENT go silent` | Silence + muted flag |
| `@AGENT stop playing` | Silence + muted flag |
| `@AGENT drop out` | Silence + muted flag |
| `@AGENT lay out` / `sit out` | Silence + muted flag |

**Re-entry:** Any targeted non-mute cue un-mutes the agent (e.g., `@BEAT come back in with a tight pocket`). `unmute` alone is intentionally not treated as a mute cue.

## Top Bar: What Changes (And What Does Not)

| Element | Changes During Jam? | Notes |
|---------|-------------------|-------|
| Key | Yes | Via boss directive or agent consensus |
| BPM | Yes | Via boss directive or agent decision |
| Energy (`E:`) | Yes | Via boss directive or agent decision |
| Chord chips | Yes | Via agent `suggested_chords` or auto-tick consensus |
| Genre preset | **No** | Locked at jam start. Stop → new jam → new preset to change |

## Chords and Harmony

| What | Status |
|------|--------|
| Boss key changes (`Switch to D major`) | Deterministic — works immediately |
| Key → scale derivation | Deterministic — automatic |
| Explicit chord sequences in boss text | **Not parsed** — not supported today |
| Agent `suggested_chords` (high confidence) | Works — applied during auto-tick |
| Auto-derived fallback chords on key consensus | Works — applied during auto-tick |

Agent key/chord suggestions are applied during auto-tick processing (autonomous rounds), not during the boss directive turn path.

## Reliable Prompt Recipes (Copy/Paste)

| Goal | Prompt |
|------|--------|
| Guarantee tempo | `BPM 140` or `140 BPM` |
| Targeted tempo | `@BEAT BPM 140 and keep the pocket tight` |
| Key + tempo | `Switch to D major, BPM 140` |
| Targeted key + tempo | `@ARIA switch to Eb minor, BPM 96` |
| Force energy | `energy 7`, `energy to 3`, `max energy`, `minimal` |
| Relative change | `a bit faster, more energy, keep it locked` |
| Relative + constraint | `slower and calmer, but don't lose momentum` |
| Targeted relative | `@CHORDS more energy, but stay out of ARIA's register` |

## Gotchas: Phrases That Surprise People

| What You Said | Why It Didn't Work | Say This Instead |
|---------------|-------------------|-----------------|
| `BPM to 140` | `to` not in deterministic pattern | `BPM 140` |
| `tempo to 128` | `to` not in deterministic pattern | `tempo 128` |
| `faster` | Relative cue, not guaranteed BPM change | `BPM {n}` for guaranteed change |
| `Change chords to Dm G C` | Chord progressions not parsed from boss text | Let agents derive chords, or change key |
| `Switch genre to Funk` | Genre is a session preset, not a live directive | Stop jam → new jam → pick preset |

## Troubleshooting: "Nothing Changed"

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| All directives ignored | Jam not armed yet | Choose preset + press Play first |
| Targeted directive went to everyone | `@mention` not at start of message | Move `@BEAT` etc. to the very beginning |
| `faster`/`more energy` didn't move the meter | Relative cue with no usable agent decision | Use explicit `BPM {n}` or `energy {n}` |
| Chord progression didn't apply | Boss text doesn't parse chord sequences | Change key instead; let agents derive chords |
| Genre didn't change | Genre is locked per jam session | Stop → new jam → pick different preset |

## Recommended Boss Prompting Style

For best results, combine one deterministic anchor with one expressive cue:

- `BPM 132, more energy, keep the pocket tight`
- `Switch to A minor, slower, thinner texture`
- `@BEAT half time, but stay punchy`

This gives the runtime a reliable anchor while preserving musical creativity.
