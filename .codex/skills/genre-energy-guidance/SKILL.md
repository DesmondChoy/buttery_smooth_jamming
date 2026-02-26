---
name: genre-energy-guidance
description: Per-genre, per-role energy guidance for jam agents. Provides descriptive musical intent across LOW (1-3), MID (4-6), and HIGH (7-10) energy bands. Use when jam agents need energy-appropriate musical behavior for a specific genre, or when falling back to generic energy guidance for unsupported genres.
---

# Genre Energy Guidance

## When to use

Apply this guidance whenever a jam agent receives an energy level (1-10) and a genre context. The guidance tells you *what kind of musical behavior* is appropriate — not specific patterns or notes.

## The 3-band energy model

Every genre defines guidance across three energy bands for each role (drums, bass, melody, chords):

| Band | Range | Intent |
|------|-------|--------|
| LOW  | 1-3   | Sparse, restrained, space-dominant |
| MID  | 4-6   | Core groove, balanced activity |
| HIGH | 7-10  | Full density, maximum expression |

Each bullet line is **descriptive musical intent** — a short phrase capturing the character, density, and attitude for that role at that energy level. Agents should interpret it through their instrument's sound palette, not treat it as a literal recipe.

## How to apply

1. Look up the current genre in `references/genres.md`
2. Find your role (drums, bass, melody, or chords)
3. Read the bullet for your current energy band
4. Use the description to shape your pattern's density, complexity, and character
5. Stay within the energy band boundaries — don't play HIGH behavior at MID energy

## Fallback rules

- **Unknown or unsupported genre**: Use the `Generic` section. It provides role-appropriate energy guidance without genre-specific flavor.
- **Ambiguous energy**: If the energy level is unclear, hold your current energy level rather than guessing.
- **Missing role**: If your role isn't listed for a genre (shouldn't happen), fall back to Generic for your role.

## Anti-patterns

- **Literal pattern recipes**: The guidance says "walking quarter-note bass" — this describes a *feel*, not a Strudel pattern to copy verbatim. Translate intent into your sound.
- **Ignoring energy bands**: Playing full-density fills at energy 2 violates the guidance even if the genre matches.
- **Overriding genre character**: At the same energy level, Jazz drums and Punk drums should sound very different. Don't flatten genre distinctions.
- **Treating guidance as mandatory**: If the musical moment calls for a brief departure (a fill, a break, a surprise), that's musicianship. The guidance sets the baseline, not a cage.

## Reference data

Full per-genre, per-role energy tables are in [`references/genres.md`](references/genres.md).

Supported genres: Dark Ambient, Pop, Jazz, Blues, Funk, Waltz, Afrobeat, Lo-fi Hip Hop, Drum & Bass, Reggae, Prog Rock, Latin, Mixolydian Rock, Cinematic, Bossa Nova, Punk, Generic.
