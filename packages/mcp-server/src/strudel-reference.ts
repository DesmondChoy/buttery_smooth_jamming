// Strudel API reference documentation
// This will be exposed as an MCP resource at strudel://reference

export const STRUDEL_REFERENCE = `
# Strudel Pattern Reference

Strudel is a live coding environment for making music with code. Patterns describe sequences of events that repeat over time (cycles).

## Core Pattern Functions

### \`note(pattern)\`
Play notes using note names or MIDI numbers.

\`\`\`javascript
note("c3 e3 g3")           // C major arpeggio
note("c3 e3 g3 b3")        // C major 7th chord arpeggio
note("60 64 67")           // Same as c3 e3 g3 using MIDI numbers
note("c3 [e3 g3]")         // e3 and g3 share the time of one step
\`\`\`

### \`sound(pattern)\` / \`s(pattern)\`
Select sounds or samples. \`s()\` is shorthand for \`sound()\`.

\`\`\`javascript
sound("bd sd hh sd")       // Basic beat: kick, snare, hihat, snare
s("bd sd hh sd")           // Same thing, shorter syntax
sound("piano")             // Play piano sample
s("bd*4")                  // Four kicks per cycle
\`\`\`

### \`n(pattern)\`
Select which sample variation to play from a sample bank.

\`\`\`javascript
s("hh").n("0 1 2 3")       // Different hihat variations
s("piano").n("0 2 4")      // Different piano notes in the bank
\`\`\`

## Mini-notation

Mini-notation is a compact way to write patterns inside strings.

| Symbol | Meaning | Example |
|--------|---------|---------|
| \`~\` | Rest/silence | \`"bd ~ sd ~"\` |
| \`*n\` | Repeat n times | \`"bd*4"\` = \`"bd bd bd bd"\` |
| \`/n\` | Slow down by n | \`"bd/2"\` plays every 2 cycles |
| \`[]\` | Grouping (fit into one step) | \`"[bd sd] hh"\` |
| \`<>\` | Alternation (one per cycle) | \`"<c3 e3 g3>"\` cycles through notes |
| \`,\` | Parallel (stack) | \`"c3,e3,g3"\` plays all at once |
| \`:\` | Select sample | \`"bd:2"\` = \`s("bd").n(2)\` |
| \`?\` | Random (50% chance) | \`"bd? sd"\` |
| \`!\` | Replicate | \`"bd!3"\` = \`"bd bd bd"\` (3 total) |
| \`@n\` | Elongate (stretch time) | \`"c3@2 e3"\` (c3 takes 2/3 of cycle) |
| \`_\` | Elongate continuation | \`"c3 _ e3"\` = \`"c3@2 e3"\` |

### Mini-notation Examples

\`\`\`javascript
s("bd sd:2 [hh hh] sd")    // Grouping and sample selection
note("<c3 e3> <g3 b3>")    // Alternating patterns
s("bd*4, hh*8")            // Layered patterns (kick + hihat)
s("bd ~ sd ~")             // Rests between hits
s("[bd sd]*2 hh")          // Grouped repetition
note("c3@3 e3")            // c3 takes 3/4 of cycle, e3 takes 1/4
\`\`\`

## Pattern Modifiers (Methods)

### Speed Control

\`\`\`javascript
s("bd sd").fast(2)         // 2x speed (plays twice per cycle)
s("bd sd").slow(2)         // Half speed (takes 2 cycles)
note("c3 e3 g3").fast(4)   // Rapid arpeggio
\`\`\`

### Transformation

\`\`\`javascript
s("bd sd hh").rev()        // Reverse: hh sd bd
s("bd sd hh").palindrome() // Forward then backward
note("c3 e3 g3").ply(2)    // Double each event
s("bd sd hh").shuffle()    // Randomize order
\`\`\`

### Conditional/Periodic

\`\`\`javascript
s("bd sd").every(4, x => x.fast(2))      // Speed up every 4th cycle
s("bd sd").sometimes(x => x.fast(2))     // 50% chance to speed up
s("bd sd").often(x => x.fast(2))         // 75% chance
s("bd sd").rarely(x => x.fast(2))        // 25% chance
s("bd sd").someCycles(x => x.fast(2))    // Same as sometimes
\`\`\`

### Euclidean Rhythms

\`\`\`javascript
s("bd").euclid(3, 8)       // 3 hits spread over 8 steps
s("sd").euclid(5, 8)       // Classic clave-like pattern
s("hh").euclid(7, 16)      // Complex hihat pattern
\`\`\`

## Effects

### Volume and Panning

\`\`\`javascript
s("bd sd").gain(0.5)           // Half volume
s("bd sd").gain("1 0.5 0.7")   // Varying volumes
s("bd").pan(0)                 // Full left
s("bd").pan(1)                 // Full right
s("bd sd").pan("0 1")          // Ping-pong left/right
s("bd sd").velocity(0.8)       // MIDI velocity (0-1)
\`\`\`

### Filters

\`\`\`javascript
s("sawtooth").lpf(800)         // Low-pass filter at 800Hz
s("sawtooth").hpf(400)         // High-pass filter at 400Hz
s("sawtooth").bpf(1000)        // Band-pass filter
s("sawtooth").lpf("400 800 1200 1600")  // Filter sweep
s("sawtooth").lpf(800).lpq(10) // Filter with resonance
s("sawtooth").vowel("a e i o u")  // Vowel filter
\`\`\`

### Delay and Reverb

\`\`\`javascript
s("bd sd").delay(0.5)          // 50% delay mix
s("bd sd").delaytime(0.25)     // Delay time (in cycles)
s("bd sd").delayfeedback(0.6)  // Delay feedback amount
s("bd sd").room(0.8)           // Reverb room size
s("bd sd").size(0.9)           // Reverb size/decay
s("bd sd").delay(0.5).room(0.3)  // Combined effects
\`\`\`

### Distortion and Other Effects

\`\`\`javascript
s("bd").distort(0.5)           // Distortion
s("bd").crush(4)               // Bit crusher (lower = crunchier)
s("bd").coarse(8)              // Sample rate reduction
s("bd").shape(0.5)             // Wave shaping distortion
\`\`\`

### Pitch and Speed

\`\`\`javascript
s("bd").speed(2)               // Double playback speed (higher pitch)
s("bd").speed(-1)              // Reverse playback
s("bd").speed("1 2 0.5")       // Varying speeds
note("c3").pitch(12)           // Pitch up one octave
\`\`\`

### Envelope

\`\`\`javascript
s("bd").attack(0.1)            // Attack time
s("bd").decay(0.2)             // Decay time
s("bd").sustain(0.5)           // Sustain level
s("bd").release(0.3)           // Release time
\`\`\`

## Structure Functions

### \`stack(...patterns)\`
Layer multiple patterns to play simultaneously.

\`\`\`javascript
stack(
  s("bd sd bd sd"),
  s("hh*8"),
  note("c2 g2")
)
\`\`\`

### \`cat(...patterns)\` / \`seq(...patterns)\`
Sequence patterns one after another.

\`\`\`javascript
cat(
  note("c3 e3 g3"),
  note("d3 f3 a3")
)  // First pattern for one cycle, then second

seq(note("c3"), note("e3"), note("g3"))  // Same as cat
\`\`\`

### \`silence\`
A pattern of silence (rest).

\`\`\`javascript
cat(
  s("bd sd bd sd"),
  silence,
  s("hh*4")
)  // Beat, silence, hihats
\`\`\`

### \`fastcat(...patterns)\` / \`slowcat(...patterns)\`

\`\`\`javascript
fastcat(note("c3"), note("e3"), note("g3"))  // All three in one cycle
slowcat(note("c3"), note("e3"), note("g3"))  // Same as cat
\`\`\`

## Synths

### Built-in Synthesizers

\`\`\`javascript
note("c3 e3 g3").s("sine")      // Sine wave
note("c3 e3 g3").s("square")    // Square wave
note("c3 e3 g3").s("sawtooth")  // Sawtooth wave
note("c3 e3 g3").s("triangle")  // Triangle wave
note("c3 e3 g3").s("piano")     // Piano sound
\`\`\`

### Synth Parameters

\`\`\`javascript
note("c3").s("sawtooth")
  .attack(0.01)
  .decay(0.1)
  .sustain(0.5)
  .release(0.2)
  .lpf(1000)
  .lpq(5)
\`\`\`

## Common Drum Sounds

| Name | Description |
|------|-------------|
| \`bd\` | Bass drum / kick |
| \`sd\` | Snare drum |
| \`hh\` | Hi-hat |
| \`oh\` | Open hi-hat |
| \`ch\` | Closed hi-hat |
| \`cp\` | Clap |
| \`cb\` | Cowbell |
| \`rim\` | Rimshot |
| \`tom\` | Tom drum |
| \`cr\` | Crash cymbal |
| \`rd\` | Ride cymbal |

## Complete Examples

### Basic Drum Beat
\`\`\`javascript
stack(
  s("bd ~ bd ~"),
  s("~ sd ~ sd"),
  s("hh*8")
).gain(0.8)
\`\`\`

### Melodic Pattern with Effects
\`\`\`javascript
note("c3 [e3 g3] a3 g3")
  .s("sawtooth")
  .lpf("800 1200 600 1600")
  .room(0.3)
  .gain(0.6)
\`\`\`

### Evolving Pattern
\`\`\`javascript
s("bd sd:2 [hh hh:1] sd")
  .every(4, x => x.fast(2))
  .sometimes(x => x.delay(0.5))
  .room(0.2)
\`\`\`

### Layered Composition
\`\`\`javascript
stack(
  s("bd*4").gain(0.9),
  s("~ sd").delay(0.2),
  s("hh*8").gain(0.4).pan("0 1"),
  note("<c2 g2 a2 f2>").s("sine").gain(0.6)
)
\`\`\`

### Euclidean Polyrhythm
\`\`\`javascript
stack(
  s("bd").euclid(3, 8),
  s("sd").euclid(5, 8).gain(0.7),
  s("hh").euclid(7, 8).gain(0.5)
)
\`\`\`
`;
