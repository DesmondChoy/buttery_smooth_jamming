import { describe, it, expect } from 'vitest';
import {
  deriveChordProgression,
  detectRelativeMusicalContextCues,
  deriveScale,
  parseDeterministicMusicalContextChanges,
} from '../musical-context-parser';
import type { MusicalContext } from '../types';

const DEFAULT_CTX: MusicalContext = {
  genre: 'Dark Ambient',
  key: 'C minor',
  scale: ['C', 'D', 'Eb', 'F', 'G', 'Ab', 'Bb'],
  chordProgression: ['Cm', 'Ab', 'Eb', 'Bb'],
  bpm: 120,
  timeSignature: '4/4',
  energy: 5,
};

// ─── deriveScale ────────────────────────────────────────────────

describe('deriveScale', () => {
  it('C major → all naturals', () => {
    expect(deriveScale('C major')).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
  });

  it('C minor → Eb Ab Bb', () => {
    expect(deriveScale('C minor')).toEqual(['C', 'D', 'Eb', 'F', 'G', 'Ab', 'Bb']);
  });

  it('A minor → all naturals', () => {
    expect(deriveScale('A minor')).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
  });

  it('G major → F#', () => {
    expect(deriveScale('G major')).toEqual(['G', 'A', 'B', 'C', 'D', 'E', 'F#']);
  });

  it('D major → F# C#', () => {
    expect(deriveScale('D major')).toEqual(['D', 'E', 'F#', 'G', 'A', 'B', 'C#']);
  });

  it('F major → Bb', () => {
    expect(deriveScale('F major')).toEqual(['F', 'G', 'A', 'Bb', 'C', 'D', 'E']);
  });

  it('Bb major → Bb Eb', () => {
    expect(deriveScale('Bb major')).toEqual(['Bb', 'C', 'D', 'Eb', 'F', 'G', 'A']);
  });

  it('Eb minor → uses flats', () => {
    expect(deriveScale('Eb minor')).toEqual(['Eb', 'F', 'Gb', 'Ab', 'Bb', 'B', 'Db']);
  });

  it('F# minor → uses sharps', () => {
    expect(deriveScale('F# minor')).toEqual(['F#', 'G#', 'A', 'B', 'C#', 'D', 'E']);
  });

  it('E major → four sharps', () => {
    expect(deriveScale('E major')).toEqual(['E', 'F#', 'G#', 'A', 'B', 'C#', 'D#']);
  });

  it('G minor → two flats', () => {
    expect(deriveScale('G minor')).toEqual(['G', 'A', 'Bb', 'C', 'D', 'Eb', 'F']);
  });

  it('returns null for invalid input', () => {
    expect(deriveScale('X major')).toBeNull();
    expect(deriveScale('C')).toBeNull();
    expect(deriveScale('')).toBeNull();
  });
});

// ─── Key Parsing ────────────────────────────────────────────────

describe('parseDeterministicMusicalContextChanges — key', () => {
  it('"Switch to D major"', () => {
    const result = parseDeterministicMusicalContextChanges('Switch to D major', DEFAULT_CTX);
    expect(result?.key).toBe('D major');
    expect(result?.scale).toEqual(['D', 'E', 'F#', 'G', 'A', 'B', 'C#']);
  });

  it('"key of Eb minor"', () => {
    const result = parseDeterministicMusicalContextChanges('key of Eb minor', DEFAULT_CTX);
    expect(result?.key).toBe('Eb minor');
    expect(result?.scale).toBeDefined();
  });

  it('"F# minor" (standalone key+quality)', () => {
    const result = parseDeterministicMusicalContextChanges('Try F# minor for a darker sound', DEFAULT_CTX);
    expect(result?.key).toBe('F# minor');
  });

  it('"switch to G" defaults to major', () => {
    const result = parseDeterministicMusicalContextChanges('switch to G', DEFAULT_CTX);
    expect(result?.key).toBe('G major');
    expect(result?.scale).toEqual(['G', 'A', 'B', 'C', 'D', 'E', 'F#']);
  });

  it('"change key to Bb major"', () => {
    const result = parseDeterministicMusicalContextChanges('change key to Bb major', DEFAULT_CTX);
    expect(result?.key).toBe('Bb major');
  });

  it('"change to A min"', () => {
    const result = parseDeterministicMusicalContextChanges('change to A min', DEFAULT_CTX);
    expect(result?.key).toBe('A minor');
  });

  it('"in the key of Ab major"', () => {
    const result = parseDeterministicMusicalContextChanges('Play in the key of Ab major', DEFAULT_CTX);
    expect(result?.key).toBe('Ab major');
  });

  it('case insensitive: "switch to d major"', () => {
    const result = parseDeterministicMusicalContextChanges('switch to d major', DEFAULT_CTX);
    expect(result?.key).toBe('D major');
  });

  it('"switch it to E minor"', () => {
    const result = parseDeterministicMusicalContextChanges('switch it to E minor', DEFAULT_CTX);
    expect(result?.key).toBe('E minor');
  });

  it('"switch the key to C major"', () => {
    const result = parseDeterministicMusicalContextChanges('switch the key to C major', DEFAULT_CTX);
    expect(result?.key).toBe('C major');
  });
});

// ─── BPM Parsing ────────────────────────────────────────────────

describe('parseDeterministicMusicalContextChanges — BPM', () => {
  it('"BPM 140"', () => {
    const result = parseDeterministicMusicalContextChanges('Set BPM 140', DEFAULT_CTX);
    expect(result?.bpm).toBe(140);
  });

  it('"tempo 90"', () => {
    const result = parseDeterministicMusicalContextChanges('tempo 90 please', DEFAULT_CTX);
    expect(result?.bpm).toBe(90);
  });

  it('"140 BPM"', () => {
    const result = parseDeterministicMusicalContextChanges('Take it to 140 BPM', DEFAULT_CTX);
    expect(result?.bpm).toBe(140);
  });

  it('"140bpm" (no space)', () => {
    const result = parseDeterministicMusicalContextChanges('Go to 140bpm', DEFAULT_CTX);
    expect(result?.bpm).toBe(140);
  });

  it('clamps below 60', () => {
    const result = parseDeterministicMusicalContextChanges('BPM 30', DEFAULT_CTX);
    expect(result?.bpm).toBe(60);
  });

  it('clamps above 300', () => {
    const result = parseDeterministicMusicalContextChanges('BPM 400', DEFAULT_CTX);
    expect(result?.bpm).toBe(300);
  });

  it('"half time" halves BPM', () => {
    const result = parseDeterministicMusicalContextChanges('half time feel', DEFAULT_CTX);
    expect(result?.bpm).toBe(60);
  });

  it('"double time" doubles BPM', () => {
    const result = parseDeterministicMusicalContextChanges('double time!', DEFAULT_CTX);
    expect(result?.bpm).toBe(240);
  });

  it('half time clamps to minimum', () => {
    const ctx = { ...DEFAULT_CTX, bpm: 80 };
    const result = parseDeterministicMusicalContextChanges('half time', ctx);
    expect(result?.bpm).toBe(60); // 80/2=40, clamped to 60
  });

  it('double time clamps to maximum', () => {
    const ctx = { ...DEFAULT_CTX, bpm: 200 };
    const result = parseDeterministicMusicalContextChanges('double time', ctx);
    expect(result?.bpm).toBe(300); // 200*2=400, clamped to 300
  });
});

// ─── Energy Parsing ─────────────────────────────────────────────

describe('parseDeterministicMusicalContextChanges — energy', () => {
  it('"energy 8"', () => {
    const result = parseDeterministicMusicalContextChanges('energy 8', DEFAULT_CTX);
    expect(result?.energy).toBe(8);
  });

  it('"energy to 3"', () => {
    const result = parseDeterministicMusicalContextChanges('Set energy to 3', DEFAULT_CTX);
    expect(result?.energy).toBe(3);
  });

  it('clamps energy below 1', () => {
    const result = parseDeterministicMusicalContextChanges('energy 0', DEFAULT_CTX);
    expect(result?.energy).toBe(1);
  });

  it('clamps energy above 10', () => {
    const result = parseDeterministicMusicalContextChanges('energy 15', DEFAULT_CTX);
    expect(result?.energy).toBe(10);
  });

  it('"full energy" sets to 10', () => {
    const result = parseDeterministicMusicalContextChanges('full energy!', DEFAULT_CTX);
    expect(result?.energy).toBe(10);
  });

  it('"max energy" sets to 10', () => {
    const result = parseDeterministicMusicalContextChanges('max energy now', DEFAULT_CTX);
    expect(result?.energy).toBe(10);
  });

  it('"minimal" sets to 1', () => {
    const result = parseDeterministicMusicalContextChanges('Go minimal', DEFAULT_CTX);
    expect(result?.energy).toBe(1);
  });

});

// ─── Combined Directives ────────────────────────────────────────

describe('parseDeterministicMusicalContextChanges — combined', () => {
  it('"Switch to D major, BPM 140, energy 7"', () => {
    const result = parseDeterministicMusicalContextChanges(
      'Switch to D major, BPM 140, energy 7',
      DEFAULT_CTX
    );
    expect(result?.key).toBe('D major');
    expect(result?.bpm).toBe(140);
    expect(result?.energy).toBe(7);
    expect(result?.scale).toEqual(['D', 'E', 'F#', 'G', 'A', 'B', 'C#']);
  });

  it('"BPM 140 and faster" prefers explicit BPM over relative tempo', () => {
    const result = parseDeterministicMusicalContextChanges('BPM 140 and faster', DEFAULT_CTX);
    expect(result?.bpm).toBe(140);
  });

  it('"energy 8 and more energy" prefers explicit energy over relative energy', () => {
    const result = parseDeterministicMusicalContextChanges('energy 8 and more energy', DEFAULT_CTX);
    expect(result?.energy).toBe(8);
  });

});

// ─── No-Match Cases ─────────────────────────────────────────────

describe('parseDeterministicMusicalContextChanges — no match', () => {
  it('"more cowbell" returns null', () => {
    expect(parseDeterministicMusicalContextChanges('more cowbell', DEFAULT_CTX)).toBeNull();
  });

  it('"play something funky" returns null', () => {
    expect(parseDeterministicMusicalContextChanges('play something funky', DEFAULT_CTX)).toBeNull();
  });

  it('"add some reverb" returns null', () => {
    expect(parseDeterministicMusicalContextChanges('add some reverb', DEFAULT_CTX)).toBeNull();
  });

  it('empty string returns null', () => {
    expect(parseDeterministicMusicalContextChanges('', DEFAULT_CTX)).toBeNull();
  });
});

// ─── Jam Runtime Helper Parsing ──────────────────────────────────

describe('parseDeterministicMusicalContextChanges', () => {
  it('keeps deterministic anchors and excludes relative tempo/energy heuristics', () => {
    const result = parseDeterministicMusicalContextChanges(
      'Switch to D major, BPM 140, more energy, faster',
      DEFAULT_CTX
    );

    expect(result).toEqual({
      key: 'D major',
      scale: ['D', 'E', 'F#', 'G', 'A', 'B', 'C#'],
      bpm: 140,
    });
  });

  it('returns null for relative-only cues', () => {
    expect(parseDeterministicMusicalContextChanges('faster and more energy', DEFAULT_CTX)).toBeNull();
  });

  it('keeps half-time and double-time as deterministic tempo anchors', () => {
    expect(parseDeterministicMusicalContextChanges('half time feel', DEFAULT_CTX)).toEqual({ bpm: 60 });
    expect(parseDeterministicMusicalContextChanges('double time', DEFAULT_CTX)).toEqual({ bpm: 240 });
  });

  it('keeps explicit energy extremes while ignoring relative cues', () => {
    const result = parseDeterministicMusicalContextChanges(
      'max energy but slower',
      DEFAULT_CTX
    );
    expect(result).toEqual({ energy: 10 });
  });

  it('does not auto-derive chord progressions from a key change', () => {
    const result = parseDeterministicMusicalContextChanges('Switch to D major', DEFAULT_CTX);
    expect(result).toEqual({
      key: 'D major',
      scale: ['D', 'E', 'F#', 'G', 'A', 'B', 'C#'],
    });
    expect(result?.chordProgression).toBeUndefined();
  });

  it('ignores named chord progression templates (model/policy-owned)', () => {
    expect(parseDeterministicMusicalContextChanges('blues changes', DEFAULT_CTX)).toBeNull();
  });

  it('ignores Roman numeral progression templates (model/policy-owned)', () => {
    expect(parseDeterministicMusicalContextChanges('use I-IV-V-I', DEFAULT_CTX)).toBeNull();
  });

  it('keeps explicit key anchor while ignoring attached harmonic template hints', () => {
    const result = parseDeterministicMusicalContextChanges(
      'Switch to D major with jazz changes',
      DEFAULT_CTX
    );
    expect(result).toEqual({
      key: 'D major',
      scale: ['D', 'E', 'F#', 'G', 'A', 'B', 'C#'],
    });
    expect(result?.chordProgression).toBeUndefined();
  });
});

describe('detectRelativeMusicalContextCues', () => {
  it('detects tempo-only cues', () => {
    expect(detectRelativeMusicalContextCues('a bit faster please')).toEqual({
      tempo: 'increase',
      energy: null,
    });
  });

  it('detects energy-only cues', () => {
    expect(detectRelativeMusicalContextCues('make it calmer')).toEqual({
      tempo: null,
      energy: 'decrease',
    });
  });

  it('detects both tempo and energy cues', () => {
    expect(detectRelativeMusicalContextCues('faster and more energy')).toEqual({
      tempo: 'increase',
      energy: 'increase',
    });
  });

  it('detects no relative cues', () => {
    expect(detectRelativeMusicalContextCues('BPM 140 in D major')).toEqual({
      tempo: null,
      energy: null,
    });
  });

  it('detects mixed/contradictory cue directions', () => {
    expect(detectRelativeMusicalContextCues('faster but slower, more energy then chill')).toEqual({
      tempo: 'mixed',
      energy: 'mixed',
    });
  });

  it('does not treat half/double-time as relative tempo cues', () => {
    expect(detectRelativeMusicalContextCues('half time now')).toEqual({
      tempo: null,
      energy: null,
    });
    expect(detectRelativeMusicalContextCues('double time!')).toEqual({
      tempo: null,
      energy: null,
    });
  });
});

describe('deriveChordProgression', () => {
  it('returns I-vi-IV-V for major keys', () => {
    expect(deriveChordProgression('C major')).toEqual(['C', 'Am', 'F', 'G']);
    expect(deriveChordProgression('G major')).toEqual(['G', 'Em', 'C', 'D']);
  });

  it('returns i-VI-III-VII for minor keys', () => {
    expect(deriveChordProgression('C minor')).toEqual(['Cm', 'Ab', 'Eb', 'Bb']);
    expect(deriveChordProgression('A minor')).toEqual(['Am', 'F', 'C', 'G']);
  });

  it('handles flat keys', () => {
    expect(deriveChordProgression('Eb major')).toEqual(['Eb', 'Cm', 'Ab', 'Bb']);
  });

  it('returns null for invalid key strings', () => {
    expect(deriveChordProgression('H major')).toBeNull();
    expect(deriveChordProgression('not a key')).toBeNull();
    expect(deriveChordProgression('')).toBeNull();
  });
});
