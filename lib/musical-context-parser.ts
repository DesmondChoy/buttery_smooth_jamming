/**
 * Deterministic regex parser for extracting musical context changes
 * from boss directive text. No LLM inference — pure string matching.
 *
 * Follows the same pure-function pattern as pattern-parser.ts.
 */
import type { MusicalContext } from './types';
import { JAM_GOVERNANCE } from './jam-governance-constants';

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
 * Parse only deterministic musical context anchors used by jam runtime:
 * key changes, explicit BPM, half/double-time, and explicit energy values/extremes.
 * Relative tempo/energy phrasing is intentionally excluded so runtime can apply
 * model decisions with minimal bounds.
 *
 * Intentionally excludes chord/progression template parsing (named changes,
 * Roman numerals, explicit chord sequences). Harmonic interpretation belongs
 * to prompt/skill policy so code does not hardcode musical templates.
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

  // ─── BPM (deterministic anchors only) ─────────────────────────
  // Explicit: "BPM 140", "tempo 90", "140 BPM", "140bpm"
  const bpmExplicit =
    text.match(/\b(?:bpm|tempo)\s+(\d+)\b/i) ||
    text.match(/\b(\d+)\s*bpm\b/i);

  if (bpmExplicit) {
    changes.bpm = clamp(parseInt(bpmExplicit[1], 10), JAM_GOVERNANCE.BPM_MIN, JAM_GOVERNANCE.BPM_MAX);
    hasChanges = true;
  } else if (/\bdouble\s+time\b/i.test(text)) {
    changes.bpm = clamp(current.bpm * 2, JAM_GOVERNANCE.BPM_MIN, JAM_GOVERNANCE.BPM_MAX);
    hasChanges = true;
  } else if (/\bhalf\s+time\b/i.test(text)) {
    changes.bpm = clamp(Math.round(current.bpm / 2), JAM_GOVERNANCE.BPM_MIN, JAM_GOVERNANCE.BPM_MAX);
    hasChanges = true;
  }

  // ─── Energy (deterministic anchors only) ──────────────────────
  // Explicit: "energy 8", "energy to 3"
  const energyExplicit = text.match(/\benergy\s+(?:to\s+)?(\d+)\b/i);

  if (energyExplicit) {
    changes.energy = clamp(parseInt(energyExplicit[1], 10), JAM_GOVERNANCE.ENERGY_MIN, JAM_GOVERNANCE.ENERGY_MAX);
    hasChanges = true;
  } else if (/\b(?:full|max)\s+energy\b/i.test(text)) {
    changes.energy = JAM_GOVERNANCE.ENERGY_MAX;
    hasChanges = true;
  } else if (/\bminimal\b/i.test(text)) {
    changes.energy = JAM_GOVERNANCE.ENERGY_MIN;
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
  return /\b(?:speed\s+up|faster|push(?:\s+it)?|pick\s+up|nudge\s+up)\b/i.test(text);
}

function hasRelativeTempoDecreaseCue(text: string): boolean {
  return /\b(?:slow\s+down|slower|lay\s+back|ease\s+back|bring\s+it\s+down)\b/i.test(text);
}

function hasRelativeEnergyIncreaseCue(text: string): boolean {
  return /\b(?:more\s+energy|crank\s+it|hype|lift\s+it|hit\s+harder)\b/i.test(text);
}

function hasRelativeEnergyDecreaseCue(text: string): boolean {
  return /\b(?:chill(?:er)?|calm(?:er)?|less\s+energy|cool\s+it\s+down|settle|less\s+intense)\b/i.test(
    text
  );
}

/**
 * Derive a basic diatonic chord progression for a given key string.
 *
 * Classification: C (hybrid) — MCP-04 / bsj-7k4.15
 * The deterministic shell (deriving chords from a key) is code-owned.
 * The template choices (I-vi-IV-V major, i-VI-III-VII minor) are minimal
 * diatonic fallbacks — not a musical policy assertion.
 *
 * This function is called from `applyContextSuggestions()` when 2+ agents
 * achieve key consensus, providing immediate harmonic continuity after a
 * key change. Agents may override these defaults on subsequent turns via
 * `suggested_chords` in their decision blocks.
 *
 * Returns 4 triads using conventional chord naming (e.g. "Cm", "Ab", "Eb", "Bb").
 * Returns null if the key string is not recognized.
 */
export function deriveChordProgression(key: string): string[] | null {
  const match = key.match(/^([A-G][b#]?)\s+(major|minor)$/i);
  if (!match) return null;

  const root = normalizeNoteName(match[1]);
  if (!root) return null;
  const quality = match[2].toLowerCase() as 'major' | 'minor';

  const useFlats = shouldUseFlats(root, quality);
  let chromatic = useFlats ? FLAT_CHROMATIC : SHARP_CHROMATIC;
  let rootIndex = chromatic.indexOf(root);
  if (rootIndex === -1) {
    // Fallback: try alternative chromatic set (mirrors deriveScale)
    chromatic = useFlats ? SHARP_CHROMATIC : FLAT_CHROMATIC;
    rootIndex = chromatic.indexOf(root);
    if (rootIndex === -1) return null;
  }

  const noteAt = (semitones: number) => chromatic[(rootIndex + semitones) % 12];

  if (quality === 'major') {
    // I  vi  IV  V
    return [
      root,                        // I  (major)
      noteAt(9) + 'm',             // vi (minor)
      noteAt(5),                   // IV (major)
      noteAt(7),                   // V  (major)
    ];
  } else {
    // i  VI  III  VII
    return [
      root + 'm',                  // i   (minor)
      noteAt(8),                   // VI  (major)
      noteAt(3),                   // III (major)
      noteAt(10),                  // VII (major)
    ];
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
