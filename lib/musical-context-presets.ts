/**
 * Pool of diverse musical context presets for jam sessions.
 * Autonomous opening mode picks a random preset at jam start.
 * Staged-silent jam mode can apply a specific preset later.
 */
import type { MusicalContext } from './types';
import { deriveScale } from './musical-context-parser';

export interface JamPreset {
  id: string;
  genre: string;
  key: string;
  scale?: string[]; // explicit scale for modal keys; derived for major/minor
  chordProgression: string[];
  bpm: number;
  timeSignature: string;
  energy: number;
}

type RawPreset = Omit<JamPreset, 'id'>;

const RAW_PRESETS: RawPreset[] = [
  {
    genre: 'Dark Ambient',
    key: 'C minor',
    chordProgression: ['Cm', 'Ab', 'Eb', 'Bb'],
    bpm: 90,
    timeSignature: '4/4',
    energy: 3,
  },
  {
    genre: 'Pop',
    key: 'G major',
    chordProgression: ['G', 'Em', 'C', 'D'],
    bpm: 120,
    timeSignature: '4/4',
    energy: 6,
  },
  {
    genre: 'Jazz',
    key: 'Bb major',
    chordProgression: ['Bbmaj7', 'Gm7', 'Cm7', 'F7'],
    bpm: 130,
    timeSignature: '4/4',
    energy: 5,
  },
  {
    genre: 'Blues',
    key: 'E major',
    chordProgression: ['E7', 'A7', 'E7', 'B7'],
    bpm: 100,
    timeSignature: '4/4',
    energy: 7,
  },
  {
    genre: 'Funk',
    key: 'D dorian',
    scale: ['D', 'E', 'F', 'G', 'A', 'B', 'C'],
    chordProgression: ['Dm7', 'G7', 'Dm7', 'G7'],
    bpm: 105,
    timeSignature: '4/4',
    energy: 7,
  },
  {
    genre: 'Waltz',
    key: 'F major',
    chordProgression: ['F', 'Bb', 'C', 'F'],
    bpm: 140,
    timeSignature: '3/4',
    energy: 4,
  },
  {
    genre: 'Afrobeat',
    key: 'A minor',
    chordProgression: ['Am', 'G', 'F', 'E'],
    bpm: 115,
    timeSignature: '4/4',
    energy: 8,
  },
  {
    genre: 'Lo-fi Hip Hop',
    key: 'Eb major',
    chordProgression: ['Ebmaj7', 'Cm7', 'Abmaj7', 'Bb7'],
    bpm: 85,
    timeSignature: '4/4',
    energy: 3,
  },
  {
    genre: 'Drum & Bass',
    key: 'F# minor',
    chordProgression: ['F#m', 'D', 'A', 'E'],
    bpm: 160,
    timeSignature: '4/4',
    energy: 9,
  },
  {
    genre: 'Reggae',
    key: 'Bb major',
    chordProgression: ['Bb', 'Eb', 'F', 'Bb'],
    bpm: 80,
    timeSignature: '4/4',
    energy: 4,
  },
  {
    genre: 'Prog Rock',
    key: 'E minor',
    chordProgression: ['Em', 'C', 'G', 'D'],
    bpm: 120,
    timeSignature: '5/4',
    energy: 6,
  },
  {
    genre: 'Latin',
    key: 'A minor',
    chordProgression: ['Am', 'Dm', 'E7', 'Am'],
    bpm: 130,
    timeSignature: '6/8',
    energy: 7,
  },
  {
    genre: 'Mixolydian Rock',
    key: 'A mixolydian',
    scale: ['A', 'B', 'C#', 'D', 'E', 'F#', 'G'],
    chordProgression: ['A', 'G', 'D', 'A'],
    bpm: 110,
    timeSignature: '4/4',
    energy: 6,
  },
  {
    genre: 'Cinematic',
    key: 'D minor',
    chordProgression: ['Dm', 'Bb', 'F', 'C'],
    bpm: 95,
    timeSignature: '4/4',
    energy: 8,
  },
  {
    genre: 'Bossa Nova',
    key: 'C major',
    chordProgression: ['Cmaj7', 'Dm7', 'G7', 'Cmaj7'],
    bpm: 125,
    timeSignature: '4/4',
    energy: 4,
  },
  {
    genre: 'Punk',
    key: 'A major',
    chordProgression: ['A', 'D', 'E', 'A'],
    bpm: 155,
    timeSignature: '4/4',
    energy: 9,
  },
];

function presetIdFromGenre(genre: string): string {
  return genre
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const PRESETS: JamPreset[] = RAW_PRESETS.map((preset) => ({
  id: presetIdFromGenre(preset.genre),
  ...preset,
}));

const PRESETS_BY_ID = new Map(PRESETS.map((preset) => [preset.id, preset]));

// Fallback scale if deriveScale fails for a non-modal key
const C_MAJOR_FALLBACK = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

export const UNCONFIGURED_MUSICAL_CONTEXT: MusicalContext = {
  genre: '',
  key: '',
  scale: [],
  chordProgression: [],
  bpm: 120,
  timeSignature: '4/4',
  energy: 5,
};

export function getPresetById(presetId: string): JamPreset | null {
  return PRESETS_BY_ID.get(presetId) ?? null;
}

/**
 * Pick a random preset and return a fully-formed MusicalContext.
 */
export function randomMusicalContext(): MusicalContext {
  const preset = PRESETS[Math.floor(Math.random() * PRESETS.length)];
  return presetToMusicalContext(preset);
}

/**
 * Convert a preset to a MusicalContext, deriving the scale if not explicit.
 */
export function presetToMusicalContext(preset: JamPreset): MusicalContext {
  const scale = preset.scale ?? deriveScale(preset.key) ?? C_MAJOR_FALLBACK;
  return {
    genre: preset.genre,
    key: preset.key,
    scale: [...scale],
    chordProgression: [...preset.chordProgression],
    bpm: preset.bpm,
    timeSignature: preset.timeSignature,
    energy: preset.energy,
  };
}

export function presetIdToMusicalContext(presetId: string): MusicalContext | null {
  const preset = getPresetById(presetId);
  return preset ? presetToMusicalContext(preset) : null;
}
