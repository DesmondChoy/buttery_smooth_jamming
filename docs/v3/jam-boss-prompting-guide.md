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

## "I Want This Sound" — Prompt Cookbook by Agent

You don't need musical vocabulary. Describe what you *hear in your head* or *feel* — the tables below translate everyday descriptions into prompts that actually work, cross-referenced against what Strudel supports and what each agent's prompt knows how to do.

**How to read these tables:** The "You're thinking…" column is the vibe in your head. The "Say this" column is copy-paste-ready. The "Why it works" column explains what Strudel feature the agent will reach for.

---

### BEAT (`@BEAT`) — Drums / Groove Architecture

**What BEAT controls:** Kick, snare, hi-hats, toms, cymbals, claps, percussion, cowbell, rimshot. Can switch between 10+ drum machines (808, 909, LinnDrum, etc.) and apply effects to any drum sound.

**Optimized for:** Rhythmic foundation, pocket, syncopation, fills, transitions. Reacts to GROOVE's rhythm, protects the downbeat. Best target for relative tempo cues.

#### Sound Design — "Make the drums sound like…"

| You're thinking… | Say this | Why it works |
|-------------------|----------|--------------|
| Big boomy hip-hop kick | `@BEAT 808 kick, deep and boomy` | Switches to RolandTR808 bank — iconic sub-heavy kick |
| Crisp electronic dance kick | `@BEAT 909 kit, punchy and clean` | RolandTR909 — the house/techno standard |
| Old-school funky drums | `@BEAT LinnDrum kit, warm vintage feel` | LinnDrum bank — Prince, 80s funk |
| Dusty lo-fi beat | `@BEAT CasioRZ1 kit, crunchy and dusty` | CasioRZ1 — gritty, low-fidelity character |
| Thin retro bossa kit | `@BEAT KorgMinipops kit, light and thin` | KorgMinipops — delicate vintage percussion |
| Drums in a big empty room | `@BEAT add big reverb to the drums, cavernous` | `.room()` + `.size()` — spacious hall effect |
| Drums through a broken speaker | `@BEAT bitcrush the drums, lo-fi and gritty` | `.crush()` — bit reduction for grit |
| Echo on the snare (dub style) | `@BEAT dub delay on the snare, long echo tails` | `.delay()` + `.delayfeedback()` — dub-style repeats |
| Muffled/underwater drums | `@BEAT muffle the drums, like hearing them through a wall` | `.lpf()` — low-pass filter removes highs |
| Bright, crispy hi-hats | `@BEAT bright cutting hi-hats, open and airy` | High-frequency hat samples + `.hpf()` if needed |
| Tribal/world percussion feel | `@BEAT cowbell and rimshot accents, tribal polyrhythmic feel` | `cb`, `rim`, `perc` sounds + `.euclid()` patterns |
| Mathematical/complex rhythms | `@BEAT euclidean rhythms, spread 5 hits over 8 steps` | `.euclid(5,8)` — algorithmic rhythm distribution |
| Random/unpredictable hats | `@BEAT randomize the hi-hats, make them unpredictable` | `.sometimes()` / `.degradeBy()` — probabilistic hits |
| Reverse cymbal swells | `@BEAT reverse crash builds at phrase ends` | `.speed(-1)` — reverse playback |

#### Feel & Pattern — "Make the groove feel like…"

| You're thinking… | Say this | Why it works |
|-------------------|----------|--------------|
| Just the kick thumping, nothing else | `@BEAT strip it down to just kick on the one, energy 1` | Energy 1 = sparse, minimal hits |
| Steady head-nod beat | `@BEAT simple kick-snare groove, energy 4, keep it steady` | Mid energy = core groove without extras |
| The beat is too busy / chaotic | `@BEAT simpler, fewer hits, leave more space` | Density reduction — drops layers |
| Everything hitting at once, maximum power | `@BEAT max energy, full kit, crash-heavy, go all out` | Energy 10 = full density, all percussion layers |
| The groove feels stiff/robotic | `@BEAT loosen up the feel, more human, slight swing` | Swing/humanize language triggers timing variation |
| I want that reggae skip | `@BEAT one-drop groove, kick on 3 only, cross-stick` | One-drop = signature reggae drum pattern |
| Make it feel like a march | `@BEAT snare rolls, militaristic feel, driving` | Cinematic/marching snare patterns |
| Drums that "breathe" — loud then quiet | `@BEAT dynamic kit, loud crashes then ghost notes, contrast` | Velocity variation + selective `.gain()` patterns |

#### Genre Quick-Reference

| Genre | What to Ask For |
|-------|----------------|
| Funk / Afrobeat / Latin | Pocket language: `tight`, `syncopated`, `locked`, `on the one`. Specify hat/percussion activity vs cleaner downbeat |
| Jazz / Blues / Waltz | Feel and articulation: `brushes-feel`, `shuffle`, `conversational`, `clear beat 1 in 3/4` |
| Drum & Bass / Prog Rock | Explicit BPM/meter cues first, then phrase boundaries: `tom accents at phrase ends`, `keep odd meter readable` |
| Lo-fi Hip Hop / Reggae | Restraint and placement: `behind the beat`, `one-drop pocket`, `dusty`, `minimal hits` |

#### Demo-Ready Recipes

- `@BEAT 808 kit, half time, boomy kick with long delay tails, energy 5` — cinematic trap feel
- `@BEAT 909 kit, four-on-the-floor, bright open hats, energy 7` — classic house
- `@BEAT CasioRZ1 kit, behind the beat, dusty and muffled, energy 3` — lo-fi chill
- `@BEAT euclidean polyrhythms, 5 over 8 kick with 7 over 16 hats, tribal` — algorithmic showcase
- `@BEAT big reverb on toms, militaristic snare rolls, energy 8` — cinematic build
- `@BEAT one-drop pocket, dub delay on the snare, deep and spacious` — roots reggae

---

### GROOVE (`@GROOVE`) — Bass / Low-End Glue

**What GROOVE controls:** All bass sounds — synth bass (sine, sawtooth, square, FM), upright bass (gm_acoustic_bass), electric finger/pick/slap bass, fretless bass, synth sub-bass. Can apply filters, distortion, and effects.

**Optimized for:** Locking to BEAT's kick. Root motion, harmonic grounding, bassline contour. Stable low end with density adapted by energy/genre.

#### Sound Design — "Make the bass sound like…"

| You're thinking… | Say this | Why it works |
|-------------------|----------|--------------|
| Deep rumbling sub you feel in your chest | `@GROOVE deep sub bass, sine wave, feel it more than hear it` | `sine` oscillator = pure sub-frequency |
| Buzzy aggressive synth bass | `@GROOVE sawtooth bass, aggressive and buzzy` | `sawtooth` = rich harmonics, aggressive tone |
| Classic funk slap bass | `@GROOVE slap bass tone, funky pop and snap` | `gm_slap_bass_1` — thumb slap + pop sound |
| Smooth jazz upright bass | `@GROOVE acoustic upright bass, warm woody tone` | `gm_acoustic_bass` — double bass soundfont |
| Smooth gliding fretless | `@GROOVE fretless bass, smooth slides between notes` | `gm_fretless_bass` — characteristic portamento |
| Electric bass with a pick (punchy attack) | `@GROOVE pick bass, sharp attack, rock edge` | `gm_electric_bass_pick` — pick attack sound |
| Warm soul/R&B fingerstyle | `@GROOVE fingerstyle electric bass, warm and round` | `gm_electric_bass_finger` — Motown/soul tone |
| Growly dubstep-style wobble | `@GROOVE FM bass, growly and modulated` | `.fm()` + `.fmh()` — frequency modulation = wobble/growl |
| Distorted dirty bass | `@GROOVE distorted bass, crunchy and dirty` | `.distort()` — wave shaping on bass |
| Muffled/round dub bass | `@GROOVE deep round bass, muffle the high end, dub tone` | `.lpf()` — low-pass filter removes attack/brightness |
| Bass with echo (dub style) | `@GROOVE add dub delay to the bass, spacious echoes` | `.delay()` + `.delayfeedback()` |
| Bass that sounds hollow/nasal | `@GROOVE hollow bass tone, like through a tube` | `square` wave or `.vowel()` filter |
| Metallic/bell-like bass tone | `@GROOVE FM bass with metallic bell overtones` | `.fm()` with high `.fmh()` ratio = metallic harmonics |

#### Motion & Pattern — "Make the bass move like…"

| You're thinking… | Say this | Why it works |
|-------------------|----------|--------------|
| Just one note humming underneath | `@GROOVE just hold the root note, sustained, energy 1` | Sustained whole notes — foundation only |
| Moving steadily up and down | `@GROOVE walking bass line, steady quarter notes` | Jazz walking bass — chromatic approaches |
| Bouncing between two notes | `@GROOVE root-fifth bounce, lock to the kick` | Root-fifth pattern — classic rock/funk/pop |
| Bass fills all the rhythmic gaps | `@GROOVE busy sixteenth-note bass, fill the spaces` | High density pattern work |
| The bass is fighting the melody | `@GROOVE stay low, under c3, give ARIA room` | Register constraint — keeps bass out of melody range |
| I want the bass to follow the kick exactly | `@GROOVE lock tight to BEAT's kick, hit every time BEAT hits` | Kick-lock = rhythmic unity with drums |

#### Genre Quick-Reference

| Genre | What to Ask For |
|-------|----------------|
| Funk / Afrobeat | Syncopated root-octave movement, pocket lock. `slap bass` or `bounce` for attitude |
| Jazz / Blues | Walking behavior, chromatic approaches, or slow root support. `shuffle`/`swing`, `acoustic upright` |
| Reggae / Dub / Lo-fi | Sparse sustained bass: `deep`, `round`, `minimal motion`, `dub foundation`, `sub bass` |
| Prog Rock / Pop | Counter-melody or phrase-aware movement: `follow odd-meter phrase`, `support hook without crowding` |
| Drum & Bass | `Reese bass` (detuned sawtooth), aggressive sub, `distorted growl` for neurofunk |

#### Demo-Ready Recipes

- `@GROOVE slap bass, funky pop and snap, lock to BEAT, energy 6` — Parliament funk showcase
- `@GROOVE FM bass, growly wobble, distorted, energy 8` — aggressive electronic bass
- `@GROOVE acoustic upright, walking jazz line, warm and round, energy 5` — jazz showcase
- `@GROOVE deep sine sub, sustained root only, muffle everything above, energy 2` — minimal dub
- `@GROOVE fretless bass, smooth slides, leave air for ARIA, energy 4` — smooth jazz/fusion
- `@GROOVE sawtooth bass, bitcrushed and dirty, aggressive energy 7` — lo-fi grit showcase

---

### ARIA (`@ARIA`) — Melody / Harmonic Direction

**What ARIA controls:** Any pitched instrument — piano, electric piano (Rhodes/Wurlitzer), flute, clarinet, oboe, trumpet, violin, cello, vibraphone, marimba, kalimba, music box, sitar, steel drums. Plus all synth oscillators (sine, sawtooth, square, triangle), FM synthesis for bells/metallic tones, and wavetable synthesis.

**Optimized for:** Harmonic correctness, phrasing, motifs, tension-release. Melodic placement around GROOVE and BEAT. Key/progression suggestions when musically justified.

#### Sound Design — "Make the melody sound like…"

| You're thinking… | Say this | Why it works |
|-------------------|----------|--------------|
| Warm piano melody | `@ARIA piano melody, warm and clear` | `piano` soundfont — acoustic piano |
| Vintage electric piano (jazzy) | `@ARIA Rhodes electric piano, warm vintage keys` | `gm_epiano1` — Fender Rhodes |
| Bright retro keys (Beatles-ish) | `@ARIA Wurlitzer electric piano, bright and biting` | `gm_epiano2` — Wurlitzer |
| Airy breathy flute | `@ARIA flute melody, airy and light` | `gm_flute` — woodwind soundfont |
| Bold trumpet line | `@ARIA trumpet melody, bold and bright` | `gm_trumpet` — brass soundfont |
| Smooth violin | `@ARIA violin melody, expressive and smooth` | `gm_violin` — string soundfont |
| Jazz vibraphone (cool/mellow) | `@ARIA vibraphone melody, cool and mellow with reverb` | `gm_vibraphone` — mallet instrument + `.room()` |
| Delicate music box | `@ARIA music box melody, delicate and sparkling` | `gm_music_box` — tiny bell-like tone |
| Thumb piano (lo-fi/chill) | `@ARIA kalimba melody, gentle plucked tones` | `gm_kalimba` — African thumb piano |
| Exotic sitar | `@ARIA sitar melody, drone-like and exotic` | `gm_sitar` — Indian string soundfont |
| Caribbean steel drums | `@ARIA steel drums melody, bright and tropical` | `gm_steel_drums` — steel pan |
| Smooth pure electronic tone | `@ARIA sine wave melody, smooth and pure` | `sine` oscillator — no harmonics |
| Thick buzzy synth lead | `@ARIA sawtooth lead, thick and buzzy, add some filter` | `sawtooth` + `.lpf()` — classic synth lead |
| Hollow/woody synth | `@ARIA square wave melody, hollow and woody` | `square` — odd-harmonic tone |
| Bell/chime metallic tone | `@ARIA FM bell tones, metallic and shimmering` | `.fm()` + high `.fmh()` = bell harmonics |
| Melody that sounds like it's underwater | `@ARIA muffle the melody, low-pass filter, dreamy` | `.lpf()` — removes highs for distant/dreamy feel |
| Melody with long spacious echo | `@ARIA add delay and reverb, spacious and atmospheric` | `.delay()` + `.room()` — ambient space |
| Glitchy/broken digital melody | `@ARIA bitcrush the melody, glitchy and lo-fi` | `.crush()` — digital degradation |
| Melody played backwards | `@ARIA reverse the melody, eerie and backwards` | `.rev()` — pattern reversal |

#### Phrasing & Feel — "Make the melody behave like…"

| You're thinking… | Say this | Why it works |
|-------------------|----------|--------------|
| One catchy line that repeats | `@ARIA simple repeating hook, catchy and singable` | Motif-driven — short memorable phrase |
| Long flowing phrases | `@ARIA long legato phrases, flowing and connected` | Legato articulation + longer note values |
| Short choppy notes | `@ARIA staccato melody, short punchy notes` | Staccato = `.legato()` < 1, quick attacks |
| Notes going up a scale one by one | `@ARIA ascending scale run, stepwise motion` | Scale-degree movement |
| Big dramatic jumps between notes | `@ARIA wide interval leaps, dramatic and soaring` | Wide intervals = octave jumps, 6ths, 7ths |
| The melody is too busy/fast | `@ARIA fewer notes, leave more breathing room, sparse` | Reduces density, adds rests |
| Something eerie and unsettling | `@ARIA dissonant intervals, eerie and haunting` | Tritones, minor 2nds, chromatic tension |
| Melody that changes a bit each time | `@ARIA vary the melody each cycle, keep it evolving` | `.sometimes()` / `.every()` — probabilistic variation |

#### Genre Quick-Reference

| Genre | What to Ask For |
|-------|----------------|
| Pop / Prog Rock | Motif clarity and phrase arcs: `hook-driven`, `anthemic`, `across bar lines`, `climactic lift` |
| Jazz / Lo-fi Hip Hop | Chord-tone phrasing, sparse motifs: `warm`, `conversational`, `leave air`. `Rhodes` / `vibraphone` / `kalimba` for tone |
| Funk / Afrobeat / Latin | Rhythmic riffs or horn-like stabs instead of long legato lines. `trumpet` / `horn-like` |
| Dark Ambient / Reggae | Fewer notes, more sustain/space: `drone-like line`, `haunting intervals`. `sine` / `flute` for tone |
| Cinematic | Sweeping phrases: `violin`, `cello`, `soaring`, `climactic` |

#### Demo-Ready Recipes

- `@ARIA vibraphone melody with big reverb, jazz phrasing, cool and mellow, energy 4` — jazz club showcase
- `@ARIA FM bell tones, metallic and shimmering, sparse and atmospheric, energy 3` — ambient bells
- `@ARIA kalimba melody, gentle and lo-fi, add delay, leave air, energy 3` — chill lo-fi showcase
- `@ARIA trumpet melody, bold horn-like riffs, rhythmic and punchy, energy 7` — afrobeat/funk horn section
- `@ARIA sitar melody, drone-like, exotic intervals, big reverb, energy 5` — world music showcase
- `@ARIA piano melody, simple singable hook, energy 5, stay above GROOVE` — pop hook showcase
- `@ARIA sawtooth lead, thick and filtered, wide interval leaps, energy 8` — synth lead showcase

---

### CHORDS (`@CHORDS`) — Comping / Harmonic Support

**What CHORDS controls:** Chord instruments — piano, electric pianos, pads (gm_pad_warm, gm_pad_choir), strings (gm_string_ensemble_1), atmospheric FX, harpsichord, synth oscillators as chord beds. Uses `.voicings()` for auto-voiced jazz progressions. Controls harmonic density and rhythm of the "glue" layer.

**Optimized for:** Chord stabs, comping patterns, pads, rhythm-guitar/keys. Fills the midrange without masking ARIA or GROOVE. Arrangement contrast through density and voicing.

#### Sound Design — "Make the chords sound like…"

| You're thinking… | Say this | Why it works |
|-------------------|----------|--------------|
| Warm smooth sustained wash | `@CHORDS warm pad, sustained and smooth` | `gm_pad_warm` — long sustain synth pad |
| Choir/vocal-like sustained chords | `@CHORDS choir pad, angelic and sustained` | `gm_pad_choir` — vocal pad texture |
| Dreamy atmospheric background | `@CHORDS atmospheric pad, dreamy and ethereal` | `gm_fx_atmosphere` — ambient texture |
| Orchestra strings holding chords | `@CHORDS string ensemble, orchestral sustained chords` | `gm_string_ensemble_1` — string section |
| Clean acoustic piano chords | `@CHORDS piano chords, clean and bright` | `piano` soundfont — acoustic piano |
| Jazzy electric piano comping | `@CHORDS Rhodes comping, warm jazz voicings` | `gm_epiano1` + `.voicings()` — jazz piano |
| Old-fashioned harpsichord | `@CHORDS harpsichord chords, baroque and bright` | `gm_harpsichord` — period instrument |
| Thick buzzy synth chords | `@CHORDS sawtooth pad, thick detuned synth chords` | `sawtooth` — harmonically rich |
| Pure clean electronic chords | `@CHORDS sine wave chords, clean and electronic` | `sine` — pure tone chords |
| Chords that sound dusty/old | `@CHORDS dusty chords, add bitcrush for vinyl crackle` | `.crush()` — digital degradation = vintage character |
| Chords with long echo tails | `@CHORDS add big delay tails to the chords, spacious` | `.delay()` + `.delayfeedback()` |
| Chords drowning in reverb | `@CHORDS huge reverb on chords, cathedral-like` | `.room()` + `.size()` at high values |
| Chords that sound distant/muffled | `@CHORDS muffle the chords, low-pass filter, distant feel` | `.lpf()` — removes brightness |
| Chords with a wah-wah motion | `@CHORDS filter sweep on chords, wah-like movement` | Animated `.lpf()` pattern |

#### Rhythm & Pattern — "Make the chords move like…"

| You're thinking… | Say this | Why it works |
|-------------------|----------|--------------|
| Just hold one chord forever | `@CHORDS sustained chord pad, no rhythm, just hold it, energy 1` | Long legato, minimal changes |
| Quick short stabs on the offbeat | `@CHORDS offbeat stabs, short and tight` | Staccato chords on the "and" beats |
| Reggae guitar-like chops | `@CHORDS reggae skank, offbeat chops with reverb` | Offbeat staccato = reggae skank pattern |
| Building swell — quiet to loud | `@CHORDS slow chord swell, build gradually` | Dynamic arc — arrangement "build" language |
| Chord pads that pulse/throb | `@CHORDS pulsing chord pad, rhythmic throb` | Tremolo-like gain pattern on sustained chords |
| The chords are drowning out the melody | `@CHORDS stay quieter, leave room for ARIA, thin it out` | Space constraint — reduces density/volume |

#### Genre Quick-Reference

| Genre | What to Ask For |
|-------|----------------|
| Funk / Afrobeat / Latin | Interlocking stabs or comping cells: `offbeat stabs`, `montuno feel`, `locked with BEAT` + space constraint for ARIA |
| Jazz / Bossa Nova / Waltz | Sparse comping: `shell voicings`, `Rhodes comping`, `gentle pulses`, `leave air`, `support the dance feel` |
| Punk / Rock / Pop | Power-chord support, rhythm hits, or pad beds: `drive the section`, `anthem bed`, `short attacks` |
| Lo-fi / Dark Ambient / Dub | Harmonic beds + restraint: `dusty pad`, `dub tails`, `no dense layer`, `just enough glue`. `choir pad` / `atmospheric` for texture |
| Cinematic | Massive pads: `string ensemble`, `slow chord swells`, `cathedral reverb`, `trailer-style stabs` |

#### Demo-Ready Recipes

- `@CHORDS warm pad, cathedral reverb, sustained and dreamy, energy 3` — ambient/cinematic bed
- `@CHORDS Rhodes comping, jazz voicings, gentle syncopation, energy 4` — jazz showcase
- `@CHORDS offbeat reggae skank, tight chops with dub delay tails, energy 5` — reggae groove
- `@CHORDS choir pad, angelic and sustained, slow swell, energy 4` — ethereal atmosphere
- `@CHORDS sawtooth pad, thick and filtered, pulsing rhythm, energy 6` — electronic texture
- `@CHORDS bitcrushed dusty piano chords, lo-fi crackle, energy 3` — vintage lo-fi showcase
- `@CHORDS string ensemble, dramatic swells building to climax, energy 7` — cinematic build

---

## Full-Band Demo Scenarios (Copy-Paste Scripts)

These are multi-directive sequences to showcase the system. Send one directive at a time, waiting for the band to react before the next.

### Scenario 1: "Chill to Hype" (Energy Arc)
1. `energy 2, everyone start sparse and gentle`
2. `@ARIA kalimba melody, gentle, add delay`
3. `@CHORDS warm pad, sustained, cathedral reverb`
4. *(let it breathe for a cycle or two)*
5. `energy 5, more movement, bring it together`
6. `energy 8, full energy, everyone go for it`
7. `energy 3, pull way back, just GROOVE and BEAT`

### Scenario 2: "Drum Machine Showcase"
1. `@BEAT 808 kit, deep boomy kick, half time, energy 4`
2. *(let it sit)*
3. `@BEAT switch to 909 kit, four-on-the-floor, bright hats, energy 6`
4. *(let it sit)*
5. `@BEAT CasioRZ1, dusty lo-fi, behind the beat, energy 3`

### Scenario 3: "Instrument Tasting Menu"
1. `@ARIA piano melody, simple hook, energy 5`
2. *(after a few cycles)* `@ARIA switch to vibraphone, same melody idea, add reverb`
3. *(after a few cycles)* `@ARIA switch to FM bell tones, metallic and shimmering`
4. *(after a few cycles)* `@ARIA switch to flute, airy and light`

### Scenario 4: "Genre Teleport" (Requires stopping and restarting with new preset)
Each requires a new jam session with the appropriate genre preset, but shows range:
- **Jazz**: `BPM 120, @GROOVE acoustic upright walking bass, @ARIA vibraphone melody, @CHORDS Rhodes shell voicings, @BEAT brushes-feel`
- **Funk**: `BPM 108, @BEAT tight pocket on the one, @GROOVE slap bass, @ARIA horn-like riffs, @CHORDS offbeat stabs`
- **Dark Ambient**: `BPM 70, energy 2, @GROOVE sub drone, @ARIA single held tone with reverb, @CHORDS atmospheric pad, @BEAT sparse distant hits`

### Scenario 5: "Effects Playground"
1. `@ARIA add big reverb and delay, spacious and atmospheric`
2. `@GROOVE distort the bass, crunchy and aggressive`
3. `@BEAT bitcrush the drums, lo-fi and gritty`
4. `@CHORDS muffle the chords, low-pass filter, distant and foggy`

## Role-Specific Advanced Tips

Best prompt pattern: role target (optional) + one clear job + one anchor (BPM/key/energy) + one space constraint (`keep pocket`, `leave room`, `stay subtle`). Put `@mention` first so routing works.

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

## Demo Drafts (Easy to Read)

Use this script as one combined demo arc: directed prompts first, then vibey/abstract prompts.
Important: at jam start, no agents are active yet. Make the first cue a targeted `@mention` so one agent is activated, then continue with broadcast or targeted cues.

### Hybrid Demo Arc A) Prog Rock (Directed -> Vibey)

| # | Genre | Who | What to prompt | What to do? / Breathe | Next subagent | What to prompt next |
|---|---|---|---|---|---|---|
| 1 | prog rock | @BEAT | `@BEAT Switch to E minor, BPM 128, energy 6, establish a progressive pocket` | `hold 2 cycles` | `@BEAT` | `@BEAT LinnDrum hybrid, tight kick/snare base, tom accents on phrase ends, keep punch controlled` |
| 2 | prog rock | @BEAT | `@BEAT LinnDrum hybrid, tight kick/snare base, tom accents on phrase ends, keep punch controlled` | `hold 2 cycles` | `@GROOVE` | `@GROOVE sawtooth bass, lock to BEAT, octave-and-fifth motion, no note crowding above F2` |
| 3 | prog rock | @GROOVE | `@GROOVE sawtooth bass, lock to BEAT, octave-and-fifth motion, no note crowding above F2` | `hold 2 cycles` | `@CHORDS` | `@CHORDS sawtooth pad, thick and filtered, rhythmic pulse that swells and pulls back` |
| 4 | prog rock | @CHORDS | `@CHORDS sawtooth pad, thick and filtered, rhythmic pulse that swells and pulls back` | `hold 2 cycles` | `@ARIA` | `@ARIA synth lead, dramatic motif, filtered and wide, leave room for low end` |
| 5 | prog rock | Broadcast | `open this up, less density, more tension-and-release, keep momentum without crowding` | `breathe 2 cycles` | `@ARIA` | `@ARIA shift to shorter answer phrases, leave silence between statements` |
| 6 | prog rock | Broadcast | `now go cinematic and human, wide dynamics, let the section breathe and resolve naturally` | `breathe 2 cycles` | `@CHORDS` | `@CHORDS support with sparse swells only, no thick constant bed` |

### Hybrid Demo Arc B) Jazz (Directed -> Vibey)

| # | Genre | Who | What to prompt | What to do? / Breathe | Next subagent | What to prompt next |
|---|---|---|---|---|---|---|
| 1 | jazz | @BEAT | `@BEAT Switch to Bb major, BPM 132, energy 5, establish a clear swing pocket` | `hold 2 cycles` | `@BEAT` | `@BEAT brush kit, clear swing ride on 2 and 4, soft snare comping, no clutter` |
| 2 | jazz | @BEAT | `@BEAT brush kit, clear swing ride on 2 and 4, soft snare comping, no clutter` | `hold 2 cycles` | `@GROOVE` | `@GROOVE acoustic upright walking bass, quarter-note line, chromatic passing tones only` |
| 3 | jazz | @GROOVE | `@GROOVE acoustic upright walking bass, quarter-note line, chromatic passing tones only` | `hold 2 cycles` | `@CHORDS` | `@CHORDS Rhodes comping, light shell voicings, sparse syncopation, stay out of ARIA's lane` |
| 4 | jazz | @CHORDS | `@CHORDS Rhodes comping, light shell voicings, sparse syncopation, stay out of ARIA's lane` | `hold 2 cycles` | `@ARIA` | `@ARIA piano motif, hook-first phrasing, concise lines, clear breath between phrases` |
| 5 | jazz | Broadcast | `take this smoky and intimate, reduce note count, make every phrase conversational` | `breathe 2 cycles` | `@GROOVE` | `@GROOVE keep walking but lighter touch, less busy turnarounds` |
| 6 | jazz | Broadcast | `now just listen and answer each other, leave space, resolve gently when it feels right` | `breathe 2 cycles` | `@ARIA` | `@ARIA short call-and-response phrases only, then silence` |
