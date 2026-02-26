<!-- Shared Strudel reference. Also served by MCP server at strudel://reference -->

# Strudel Pattern Reference

Strudel is a live coding environment for making music with code. Patterns describe sequences of events that repeat over time (cycles).

## Core Pattern Functions

### `note(pattern)`
Play notes using note names or MIDI numbers.

```javascript
note("c3 e3 g3")           // C major arpeggio
note("c3 e3 g3 b3")        // C major 7th chord arpeggio
note("60 64 67")           // Same as c3 e3 g3 using MIDI numbers
note("c3 [e3 g3]")         // e3 and g3 share the time of one step
```

### `sound(pattern)` / `s(pattern)`
Select sounds or samples. `s()` is shorthand for `sound()`.

```javascript
sound("bd sd hh sd")       // Basic beat: kick, snare, hihat, snare
s("bd sd hh sd")           // Same thing, shorter syntax
sound("piano")             // Play piano sample
s("bd*4")                  // Four kicks per cycle
```

### `n(pattern)`
Select which sample variation to play from a sample bank.

```javascript
s("hh").n("0 1 2 3")       // Different hihat variations
s("piano").n("0 2 4")      // Different piano notes in the bank
```

## Mini-notation

Mini-notation is a compact way to write patterns inside strings.

| Symbol | Meaning | Example |
|--------|---------|---------|
| `~` | Rest/silence | `"bd ~ sd ~"` |
| `*n` | Repeat n times | `"bd*4"` = `"bd bd bd bd"` |
| `/n` | Slow down by n | `"bd/2"` plays every 2 cycles |
| `[]` | Grouping (fit into one step) | `"[bd sd] hh"` |
| `<>` | Alternation (one per cycle) | `"<c3 e3 g3>"` cycles through notes |
| `,` | Parallel (stack) | `"c3,e3,g3"` plays all at once |
| `:` | Select sample | `"bd:2"` = `s("bd").n(2)` |
| `?` | Random (50% chance) | `"bd? sd"` |
| `!` | Replicate | `"bd!3"` = `"bd bd bd"` (3 total) |
| `@n` | Elongate (stretch time) | `"c3@2 e3"` (c3 takes 2/3 of cycle) |
| `_` | Elongate continuation | `"c3 _ e3"` = `"c3@2 e3"` |

### Mini-notation Examples

```javascript
s("bd sd:2 [hh hh] sd")    // Grouping and sample selection
note("<c3 e3> <g3 b3>")    // Alternating patterns
s("bd*4, hh*8")            // Layered patterns (kick + hihat)
s("bd ~ sd ~")             // Rests between hits
s("[bd sd]*2 hh")          // Grouped repetition
note("c3@3 e3")            // c3 takes 3/4 of cycle, e3 takes 1/4
```

## Pattern Modifiers (Methods)

### Speed Control

```javascript
s("bd sd").fast(2)         // 2x speed (plays twice per cycle)
s("bd sd").slow(2)         // Half speed (takes 2 cycles)
note("c3 e3 g3").fast(4)   // Rapid arpeggio
```

### Transformation

```javascript
s("bd sd hh").rev()        // Reverse: hh sd bd
s("bd sd hh").palindrome() // Forward then backward
note("c3 e3 g3").ply(2)    // Double each event
s("bd sd hh").shuffle()    // Randomize order
```

### Conditional/Periodic

```javascript
s("bd sd").every(4, x => x.fast(2))      // Speed up every 4th cycle
s("bd sd").sometimes(x => x.fast(2))     // 50% chance to speed up
s("bd sd").often(x => x.fast(2))         // 75% chance
s("bd sd").rarely(x => x.fast(2))        // 25% chance
s("bd sd").someCycles(x => x.fast(2))    // Same as sometimes
```

### Euclidean Rhythms

```javascript
s("bd").euclid(3, 8)       // 3 hits spread over 8 steps
s("sd").euclid(5, 8)       // Classic clave-like pattern
s("hh").euclid(7, 16)      // Complex hihat pattern
```

### Tempo

```javascript
s("bd sd hh sd").cpm(120)  // 120 cycles per minute (= 120 BPM for 4/4)
note("c3 e3 g3").cpm(90)   // Slower tempo
```

## Effects

### Volume and Panning

```javascript
s("bd sd").gain(0.5)           // Half volume
s("bd sd").gain("1 0.5 0.7")   // Varying volumes
s("bd").pan(0)                 // Full left
s("bd").pan(1)                 // Full right
s("bd sd").pan("0 1")          // Ping-pong left/right
s("bd sd").velocity(0.8)       // MIDI velocity (0-1)
```

### Filters

```javascript
s("sawtooth").lpf(800)         // Low-pass filter at 800Hz
s("sawtooth").hpf(400)         // High-pass filter at 400Hz
s("sawtooth").bpf(1000)        // Band-pass filter
s("sawtooth").lpf("400 800 1200 1600")  // Filter sweep
s("sawtooth").lpf(800).lpq(10) // Filter with resonance
s("sawtooth").vowel("a e i o u")  // Vowel filter
```

### Delay and Reverb

```javascript
s("bd sd").delay(0.5)          // 50% delay mix
s("bd sd").delaytime(0.25)     // Delay time (in cycles)
s("bd sd").delayfeedback(0.6)  // Delay feedback amount
s("bd sd").room(0.8)           // Reverb room size
s("bd sd").size(0.9)           // Reverb size/decay
s("bd sd").delay(0.5).room(0.3)  // Combined effects
```

### Distortion and Other Effects

```javascript
s("bd").distort(0.5)           // Distortion
s("bd").crush(4)               // Bit crusher (lower = crunchier)
s("bd").coarse(8)              // Sample rate reduction
s("bd").shape(0.5)             // Wave shaping distortion
```

### Pitch and Speed

```javascript
s("bd").speed(2)               // Double playback speed (higher pitch)
s("bd").speed(-1)              // Reverse playback
s("bd").speed("1 2 0.5")       // Varying speeds
note("c3").pitch(12)           // Pitch up one octave
```

### Envelope

```javascript
s("bd").attack(0.1)            // Attack time
s("bd").decay(0.2)             // Decay time
s("bd").sustain(0.5)           // Sustain level
s("bd").release(0.3)           // Release time
```

### Legato and Sustain

`.legato(n)` controls how long each note sustains relative to its step duration. Values <1 give staccato, >1 give overlapping sustain.

```javascript
note("c3 e3 g3").s("sawtooth").legato(0.3)  // Staccato (30% of step)
note("c3 e3 g3").s("sawtooth").legato(1)    // Normal (fills step exactly)
note("c3 e3 g3").s("piano").legato(2)        // Long sustain (2x step)
note("c3").s("gm_pad_warm").legato(4)        // Pad with extra-long sustain
```

### Sample Control

```javascript
s("hh*4, oh").cut(1)           // Cut group: oh chokes hh (same group = 1)
s("bd sd").orbit(1).delay(0.5) // Route to effect bus 1 (isolate effects)
```

## Structure Functions

### `stack(...patterns)`
Layer multiple patterns to play simultaneously.

```javascript
stack(
  s("bd sd bd sd"),
  s("hh*8"),
  note("c2 g2")
)
```

### `cat(...patterns)` / `seq(...patterns)`
Sequence patterns one after another.

```javascript
cat(
  note("c3 e3 g3"),
  note("d3 f3 a3")
)  // First pattern for one cycle, then second

seq(note("c3"), note("e3"), note("g3"))  // Same as cat
```

### `silence`
A pattern of silence (rest).

```javascript
cat(
  s("bd sd bd sd"),
  silence,
  s("hh*4")
)  // Beat, silence, hihats
```

### `fastcat(...patterns)` / `slowcat(...patterns)`

```javascript
fastcat(note("c3"), note("e3"), note("g3"))  // All three in one cycle
slowcat(note("c3"), note("e3"), note("g3"))  // Same as cat
```

## Scales and Chords

### Scale Functions

`.scale("root:name")` maps scale degree numbers (via `n()`) to pitched notes. Use `n()` with numbers starting from 0.

```javascript
n("0 1 2 3 4 5 6 7").scale("C:minor").s("piano")     // C minor scale
n("0 2 4 6").scale("D:dorian").s("sawtooth").lpf(1200) // D dorian arpeggiated
n("<0 2 4> <1 3 5>").scale("C:minor").s("piano")       // Alternating triads
```

Common scale names: `minor`, `major`, `dorian`, `mixolydian`, `phrygian`, `lydian`, `harmonic minor`, `melodic minor`, `pentatonic`, `blues`

### Chord Patterns

Stack notes in mini-notation with `,` to build chords. Use `<>` to sequence chord changes.

```javascript
note("<[c3,e3,g3] [f3,a3,c4] [g3,b3,d4]>").s("piano")  // I IV V progression
```

Use `.voicings("voicing")` with chord name strings for automatic voice leading:

```javascript
"Cm7 Fm7 G7 Cm7".voicings("lefthand").s("piano")  // Auto-voiced jazz changes
```

## Sound Sources

### Built-in Synthesizers

```javascript
note("c3 e3 g3").s("sine")      // Sine wave
note("c3 e3 g3").s("square")    // Square wave
note("c3 e3 g3").s("sawtooth")  // Sawtooth wave
note("c3 e3 g3").s("triangle")  // Triangle wave
note("c3 e3 g3").s("piano")     // Piano sound
```

### Synth Parameters

```javascript
note("c3").s("sawtooth")
  .attack(0.01)
  .decay(0.1)
  .sustain(0.5)
  .release(0.2)
  .lpf(1000)
  .lpq(5)
```

### FM Synthesis

`.fm(depth)` adds frequency modulation to any oscillator. `.fmh(ratio)` sets the modulator/carrier frequency ratio.

```javascript
note("c4 e4 g4 c5").s("sine").fm(4).fmh(5)          // Bell tone (high ratio)
note("c3 e3 g3 b3").s("sine").fm(2).fmh(2)
  .decay(0.3).sustain(0)                              // E-piano (moderate FM)
note("c2 c2 eb2 f2").s("sine").fm(3).fmh(1).lpf(600) // FM bass (growly)
```

### Wavetable Synthesis

`.wt("name")` applies a wavetable oscillator shape to any synth. Uses AKWF wavetable sets.

```javascript
note("c3 e3 g3").s("sine").wt("triangle")             // Wavetable triangle
note("c3 e3 g3").s("sine").wt("saw")                  // Wavetable saw
note("c3 e3").s("sine").wt("square").lpf(1200)         // Filtered wavetable
```

### GM Soundfont Instruments

Soundfonts provide realistic instrument sounds. Use with `note()` and `.s("name")`.

| Category | Instruments |
|----------|------------|
| Keys | `piano`, `gm_epiano1`, `gm_epiano2`, `gm_harpsichord`, `gm_celesta` |
| Strings | `gm_violin`, `gm_cello`, `gm_string_ensemble_1` |
| Woodwind | `gm_flute`, `gm_clarinet`, `gm_oboe`, `gm_pan_flute` |
| Brass | `gm_trumpet` |
| Mallet | `gm_vibraphone`, `gm_marimba`, `gm_kalimba`, `gm_music_box` |
| Bass | `gm_acoustic_bass`, `gm_electric_bass_finger`, `gm_slap_bass_1` |
| Pads/FX | `gm_pad_warm`, `gm_pad_choir`, `gm_fx_atmosphere` |
| World | `gm_sitar`, `gm_steel_drums` |

```javascript
note("c4 d4 e4 f4").s("gm_flute").room(0.3)           // Flute melody
note("c2 g2 c2 e2").s("gm_acoustic_bass").gain(0.6)   // Upright bass
note("c3 e3 g3").s("gm_pad_warm").legato(4).gain(0.4)  // Sustained pad
```

### Drum Machine Banks

`.bank("name")` selects a drum machine. Use with standard drum names (`bd`, `sd`, `hh`, etc.).

| Style | Banks |
|-------|-------|
| Electronic | `RolandTR909`, `RolandTR808`, `RolandTR707`, `RolandTR606` |
| Vintage | `LinnDrum`, `AkaiLinn`, `BossDR110` |
| Lo-fi | `CasioRZ1`, `KorgMinipops` |
| Punchy | `AlesisHR16`, `YamahaRX5` |

```javascript
s("bd sd hh sd").bank("RolandTR909")    // TR-909 house beat
s("bd*4").bank("RolandTR808").gain(0.6) // 808 four-on-the-floor
s("bd ~ sd ~, hh*8").bank("CasioRZ1")  // Lo-fi drum machine groove
```

## Common Drum Sounds

| Name | Description |
|------|-------------|
| `bd` | Bass drum / kick |
| `sd` | Snare drum |
| `hh` | Hi-hat |
| `oh` | Open hi-hat |
| `ch` | Closed hi-hat |
| `cp` | Clap |
| `cb` | Cowbell |
| `rim` | Rimshot |
| `tom` | Tom drum |
| `cr` | Crash cymbal |
| `rd` | Ride cymbal |

## Complete Examples

### Basic Drum Beat
```javascript
stack(
  s("bd ~ bd ~"),
  s("~ sd ~ sd"),
  s("hh*8")
).gain(0.8)
```

### Melodic Pattern with Soundfont
```javascript
n("0 2 4 6 4 2")
  .scale("C:minor")
  .s("gm_vibraphone")
  .room(0.4)
  .gain(0.5)
```

### Full Band Stack
```javascript
stack(
  s("bd*4").bank("RolandTR909").gain(0.6),
  note("<c2 g2 ab2 eb2>").s("gm_acoustic_bass").gain(0.6),
  note("c4 eb4 g4 bb4").s("sine").fm(1).fmh(2).room(0.3).gain(0.5),
  note("c3").s("gm_pad_warm").legato(4).gain(0.35)
)
```
