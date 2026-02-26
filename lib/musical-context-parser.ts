/**
 * Deterministic regex parser for extracting musical context changes
 * from boss directive text. No LLM inference — pure string matching.
 *
 * Follows the same pure-function pattern as pattern-parser.ts.
 */
import type { MusicalContext } from './types';

// ─── Roman numeral → scale-degree index mapping ─────────────────
const ROMAN_TO_DEGREE: Record<string, number> = {
  i: 0, ii: 1, iii: 2, iv: 3, v: 4, vi: 5, vii: 6,
};

// Chromatic scale representations
const SHARP_CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_CHROMATIC  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// Scale interval patterns (semitones from root)
const MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_INTERVALS = [0, 2, 3, 5, 7, 8, 10];

type RelativeMusicalContextCues = {
  tempo: 'increase' | 'decrease' | 'mixed' | null;
  energy: 'increase' | 'decrease' | 'mixed' | null;
};

/** Normalize note name: "eb" → "Eb", "f#" → "F#", "d" → "D" */
function normalizeNoteName(raw: string): string | null {
  const match = raw.match(/^([A-Ga-g])([#b]?)$/);
  if (!match) return null;
  return match[1].toUpperCase() + match[2];
}

/** Determine whether a key conventionally uses flats or sharps. */
function shouldUseFlats(root: string, quality: 'major' | 'minor'): boolean {
  if (root.includes('b')) return true;
  if (root.includes('#')) return false;
  // Natural root keys that conventionally use flats in their key signature
  if (quality === 'major') return new Set(['F']).has(root);
  return new Set(['D', 'G', 'C', 'F']).has(root);
}

/**
 * Derive the scale notes for a given key string like "D major" or "Eb minor".
 * Returns null if the key string is not recognized.
 *
 * Uses flats for flat keys, sharps for sharp keys, following standard conventions.
 * Note: enharmonic simplifications (B instead of Cb) are intentional — Strudel
 * uses standard note names, not double-flats or theoretically "correct" spellings.
 */
export function deriveScale(key: string): string[] | null {
  const match = key.match(/^([A-G][b#]?)\s+(major|minor)$/i);
  if (!match) return null;

  const root = normalizeNoteName(match[1]);
  if (!root) return null;
  const quality = match[2].toLowerCase() as 'major' | 'minor';

  const useFlats = shouldUseFlats(root, quality);
  const chromatic = useFlats ? FLAT_CHROMATIC : SHARP_CHROMATIC;
  const intervals = quality === 'major' ? MAJOR_INTERVALS : MINOR_INTERVALS;

  const rootIndex = chromatic.indexOf(root);
  if (rootIndex === -1) {
    // Root not found in preferred set — try the other (e.g. Db in SHARP_CHROMATIC)
    const altChromatic = useFlats ? SHARP_CHROMATIC : FLAT_CHROMATIC;
    const altIndex = altChromatic.indexOf(root);
    if (altIndex === -1) return null;
    return intervals.map((i) => altChromatic[(altIndex + i) % 12]);
  }

  return intervals.map((i) => chromatic[(rootIndex + i) % 12]);
}

/**
 * Derive a 4-chord diatonic progression for a given key string.
 *
 * Major keys: I IV V I  (e.g. C major → ['C', 'F', 'G', 'C'])
 * Minor keys: i VI III VII (e.g. C minor → ['Cm', 'Ab', 'Eb', 'Bb'])
 */
export function deriveChordProgression(key: string): string[] | null {
  const match = key.match(/^([A-G][b#]?)\s+(major|minor)$/i);
  if (!match) return null;

  const root = normalizeNoteName(match[1]);
  if (!root) return null;
  const quality = match[2].toLowerCase() as 'major' | 'minor';

  const scale = deriveScale(key);
  if (!scale) return null;

  if (quality === 'major') {
    // I IV V I — all major triads (just root name)
    return [scale[0], scale[3], scale[4], scale[0]];
  }
  // i VI III VII — root gets 'm', rest are major
  return [`${scale[0]}m`, scale[5], scale[2], scale[6]];
}

/**
 * Resolve a named progression template (blues/jazz/pop) in the given key.
 */
function resolveNamedProgression(name: string, key: string): string[] | null {
  const match = key.match(/^([A-G][b#]?)\s+(major|minor)$/i);
  if (!match) return null;

  const scale = deriveScale(key);
  if (!scale) return null;

  const quality = match[2].toLowerCase();
  const n = name.toLowerCase();

  if (n === 'blues') {
    if (quality === 'minor') {
      return [`${scale[0]}m7`, `${scale[3]}m7`, `${scale[0]}m7`, `${scale[4]}m7`];
    }
    return [`${scale[0]}7`, `${scale[3]}7`, `${scale[0]}7`, `${scale[4]}7`];
  }

  if (n === 'jazz') {
    if (quality === 'minor') {
      return [`${scale[0]}m7`, `${scale[5]}maj7`, `${scale[1]}m7b5`, `${scale[4]}7`];
    }
    return [`${scale[0]}maj7`, `${scale[5]}m7`, `${scale[1]}m7`, `${scale[4]}7`];
  }

  if (n === 'pop') {
    if (quality === 'minor') {
      return [`${scale[0]}m`, scale[4], scale[5], scale[2]];
    }
    return [scale[0], scale[4], `${scale[5]}m`, scale[3]];
  }

  return null;
}

/**
 * Resolve Roman numeral chord notation (e.g. "I-IV-V-I") against a key.
 * Uppercase = major, lowercase = minor, ° suffix = diminished.
 */
function resolveRomanNumerals(pattern: string, key: string): string[] | null {
  const scale = deriveScale(key);
  if (!scale) return null;

  const numerals = pattern.split(/[-\s]+/).filter(Boolean);
  if (numerals.length < 2) return null;

  const chords: string[] = [];
  for (const numeral of numerals) {
    const dim = numeral.endsWith('°');
    const clean = dim ? numeral.slice(0, -1) : numeral;
    const lower = clean.toLowerCase();
    const degree = ROMAN_TO_DEGREE[lower];
    if (degree === undefined) return null;

    const isMinor = clean === lower; // all-lowercase = minor
    const root = scale[degree];
    if (dim) {
      chords.push(`${root}dim`);
    } else if (isMinor) {
      chords.push(`${root}m`);
    } else {
      chords.push(root);
    }
  }
  return chords;
}

/**
 * Parse boss directive text for musical context changes.
 * Returns a partial MusicalContext with only the changed fields, or null
 * if no musical context changes were detected in the text.
 *
 * Note: jam runtime directive flow should prefer
 * `parseDeterministicMusicalContextChanges()` + `detectRelativeMusicalContextCues()`
 * so relative tempo/energy changes can be model-driven. This legacy helper keeps
 * the historical coarse relative heuristics for backward compatibility.
 */
export function parseMusicalContextChanges(
  text: string,
  current: MusicalContext
): Partial<MusicalContext> | null {
  const deterministicChanges = parseDeterministicMusicalContextChanges(text, current);
  const changes: Partial<MusicalContext> = deterministicChanges
    ? { ...deterministicChanges }
    : {};
  let hasChanges = Object.keys(changes).length > 0;

  if (changes.bpm === undefined) {
    if (hasRelativeTempoIncreaseCue(text)) {
      changes.bpm = clamp(current.bpm + 15, 60, 300);
      hasChanges = true;
    } else if (hasRelativeTempoDecreaseCue(text)) {
      changes.bpm = clamp(current.bpm - 15, 60, 300);
      hasChanges = true;
    }
  }

  if (changes.energy === undefined) {
    if (hasRelativeEnergyIncreaseCue(text)) {
      changes.energy = clamp(current.energy + 2, 1, 10);
      hasChanges = true;
    } else if (hasRelativeEnergyDecreaseCue(text)) {
      changes.energy = clamp(current.energy - 2, 1, 10);
      hasChanges = true;
    }
  }

  return hasChanges ? changes : null;
}

/**
 * Parse only deterministic musical context anchors used by jam runtime:
 * key changes, explicit BPM, half/double-time, and explicit energy values/extremes.
 * Relative tempo/energy phrasing is intentionally excluded so runtime can apply
 * model decisions with minimal bounds.
 */
export function parseDeterministicMusicalContextChanges(
  text: string,
  current: MusicalContext
): Partial<MusicalContext> | null {
  const changes: Partial<MusicalContext> = {};
  let hasChanges = false;

  // ─── Key ──────────────────────────────────────────────────────
  // "Switch to D major", "key of Eb minor", "change to G", "in the key of A minor"
  const keyPatterns = [
    /(?:switch(?:\s+(?:it|the\s+key))?\s+to|key\s+of|in\s+the\s+key\s+of|change\s+(?:the\s+)?(?:key\s+)?to)\s+([A-G][b#]?)\s*(major|minor|maj|min)?/i,
    /\b([A-G][b#]?)\s+(major|minor)\b/i,
  ];

  for (const pattern of keyPatterns) {
    const match = text.match(pattern);
    if (match) {
      const root = normalizeNoteName(match[1]);
      if (root) {
        let quality = 'major'; // default when quality omitted
        if (match[2]) {
          quality = match[2].toLowerCase().startsWith('min') ? 'minor' : 'major';
        }
        const keyStr = `${root} ${quality}`;
        changes.key = keyStr;
        const scale = deriveScale(keyStr);
        if (scale) changes.scale = scale;
        hasChanges = true;
        break;
      }
    }
  }

  // ─── Chord Progression ──────────────────────────────────────────
  // Priority: explicit chords > named progression > auto-derive from key change

  // 1. Explicit chord names: "play Dm Am G C", "chords Cmaj7 Fm7 G7 Cmaj7"
  const explicitChordMatch = text.match(
    /\b(?:play|chords?|use|progression)[:\s]+([A-G][b#]?m?(?:aj|in|maj|min|dim|aug|7|maj7|m7|m7b5|sus[24])?(?:\s+[A-G][b#]?m?(?:aj|in|maj|min|dim|aug|7|maj7|m7|m7b5|sus[24])?){1,7})\b/i
  );
  if (explicitChordMatch) {
    changes.chordProgression = explicitChordMatch[1].trim().split(/\s+/);
    hasChanges = true;
  }

  // 2. Roman numeral notation: "use I-IV-V-I", "I IV V I progression"
  if (!changes.chordProgression) {
    const romanMatch =
      text.match(/\b(?:play|use|progression)[:\s]+((?:[iIvV]+[°]?[-\s]){1,7}[iIvV]+[°]?)\b/) ||
      text.match(/\b((?:[iIvV]+[°]?[-\s]){1,7}[iIvV]+[°]?)\s+progression\b/i);
    if (romanMatch) {
      const resolvedKey = changes.key || current.key;
      const resolved = resolveRomanNumerals(romanMatch[1], resolvedKey);
      if (resolved) {
        changes.chordProgression = resolved;
        hasChanges = true;
      }
    }
  }

  // 3. Named progression: "blues changes", "jazz progression", "pop chords"
  if (!changes.chordProgression) {
    const namedMatch = text.match(/\b(blues|jazz|pop)\s+(?:changes|chords|progression)\b/i);
    if (namedMatch) {
      const resolvedKey = changes.key || current.key;
      const resolved = resolveNamedProgression(namedMatch[1], resolvedKey);
      if (resolved) {
        changes.chordProgression = resolved;
        hasChanges = true;
      }
    }
  }

  // 4. Auto-derive from key change (fallback)
  if (!changes.chordProgression && changes.key) {
    const chords = deriveChordProgression(changes.key);
    if (chords) {
      changes.chordProgression = chords;
    }
  }

  // ─── BPM (deterministic anchors only) ─────────────────────────
  // Explicit: "BPM 140", "tempo 90", "140 BPM", "140bpm"
  const bpmExplicit =
    text.match(/\b(?:bpm|tempo)\s+(\d+)\b/i) ||
    text.match(/\b(\d+)\s*bpm\b/i);

  if (bpmExplicit) {
    changes.bpm = clamp(parseInt(bpmExplicit[1], 10), 60, 300);
    hasChanges = true;
  } else if (/\bdouble\s+time\b/i.test(text)) {
    changes.bpm = clamp(current.bpm * 2, 60, 300);
    hasChanges = true;
  } else if (/\bhalf\s+time\b/i.test(text)) {
    changes.bpm = clamp(Math.round(current.bpm / 2), 60, 300);
    hasChanges = true;
  }

  // ─── Energy (deterministic anchors only) ──────────────────────
  // Explicit: "energy 8", "energy to 3"
  const energyExplicit = text.match(/\benergy\s+(?:to\s+)?(\d+)\b/i);

  if (energyExplicit) {
    changes.energy = clamp(parseInt(energyExplicit[1], 10), 1, 10);
    hasChanges = true;
  } else if (/\b(?:full|max)\s+energy\b/i.test(text)) {
    changes.energy = 10;
    hasChanges = true;
  } else if (/\bminimal\b/i.test(text)) {
    changes.energy = 1;
    hasChanges = true;
  }

  return hasChanges ? changes : null;
}

export function detectRelativeMusicalContextCues(text: string): RelativeMusicalContextCues {
  const tempoIncrease = hasRelativeTempoIncreaseCue(text);
  const tempoDecrease = hasRelativeTempoDecreaseCue(text);
  const energyIncrease = hasRelativeEnergyIncreaseCue(text);
  const energyDecrease = hasRelativeEnergyDecreaseCue(text);

  return {
    tempo: resolveCueDirection(tempoIncrease, tempoDecrease),
    energy: resolveCueDirection(energyIncrease, energyDecrease),
  };
}

function resolveCueDirection(
  increase: boolean,
  decrease: boolean
): RelativeMusicalContextCues['tempo'] {
  if (increase && decrease) return 'mixed';
  if (increase) return 'increase';
  if (decrease) return 'decrease';
  return null;
}

function hasRelativeTempoIncreaseCue(text: string): boolean {
  return /\b(?:speed\s+up|faster)\b/i.test(text);
}

function hasRelativeTempoDecreaseCue(text: string): boolean {
  return /\b(?:slow\s+down|slower)\b/i.test(text);
}

function hasRelativeEnergyIncreaseCue(text: string): boolean {
  return /\b(?:more\s+energy|crank\s+it|hype)\b/i.test(text);
}

function hasRelativeEnergyDecreaseCue(text: string): boolean {
  return /\b(?:chill(?:er)?|calm(?:er)?|less\s+energy)\b/i.test(text);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
