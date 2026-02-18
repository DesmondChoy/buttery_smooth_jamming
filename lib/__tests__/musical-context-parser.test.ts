import { describe, it, expect } from 'vitest';
import { parseMusicalContextChanges, deriveScale } from '../musical-context-parser';
import type { MusicalContext } from '../types';

const DEFAULT_CTX: MusicalContext = {
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

describe('parseMusicalContextChanges — key', () => {
  it('"Switch to D major"', () => {
    const result = parseMusicalContextChanges('Switch to D major', DEFAULT_CTX);
    expect(result?.key).toBe('D major');
    expect(result?.scale).toEqual(['D', 'E', 'F#', 'G', 'A', 'B', 'C#']);
  });

  it('"key of Eb minor"', () => {
    const result = parseMusicalContextChanges('key of Eb minor', DEFAULT_CTX);
    expect(result?.key).toBe('Eb minor');
    expect(result?.scale).toBeDefined();
  });

  it('"F# minor" (standalone key+quality)', () => {
    const result = parseMusicalContextChanges('Try F# minor for a darker sound', DEFAULT_CTX);
    expect(result?.key).toBe('F# minor');
  });

  it('"switch to G" defaults to major', () => {
    const result = parseMusicalContextChanges('switch to G', DEFAULT_CTX);
    expect(result?.key).toBe('G major');
    expect(result?.scale).toEqual(['G', 'A', 'B', 'C', 'D', 'E', 'F#']);
  });

  it('"change key to Bb major"', () => {
    const result = parseMusicalContextChanges('change key to Bb major', DEFAULT_CTX);
    expect(result?.key).toBe('Bb major');
  });

  it('"change to A min"', () => {
    const result = parseMusicalContextChanges('change to A min', DEFAULT_CTX);
    expect(result?.key).toBe('A minor');
  });

  it('"in the key of Ab major"', () => {
    const result = parseMusicalContextChanges('Play in the key of Ab major', DEFAULT_CTX);
    expect(result?.key).toBe('Ab major');
  });

  it('case insensitive: "switch to d major"', () => {
    const result = parseMusicalContextChanges('switch to d major', DEFAULT_CTX);
    expect(result?.key).toBe('D major');
  });

  it('"switch it to E minor"', () => {
    const result = parseMusicalContextChanges('switch it to E minor', DEFAULT_CTX);
    expect(result?.key).toBe('E minor');
  });

  it('"switch the key to C major"', () => {
    const result = parseMusicalContextChanges('switch the key to C major', DEFAULT_CTX);
    expect(result?.key).toBe('C major');
  });
});

// ─── BPM Parsing ────────────────────────────────────────────────

describe('parseMusicalContextChanges — BPM', () => {
  it('"BPM 140"', () => {
    const result = parseMusicalContextChanges('Set BPM 140', DEFAULT_CTX);
    expect(result?.bpm).toBe(140);
  });

  it('"tempo 90"', () => {
    const result = parseMusicalContextChanges('tempo 90 please', DEFAULT_CTX);
    expect(result?.bpm).toBe(90);
  });

  it('"140 BPM"', () => {
    const result = parseMusicalContextChanges('Take it to 140 BPM', DEFAULT_CTX);
    expect(result?.bpm).toBe(140);
  });

  it('"140bpm" (no space)', () => {
    const result = parseMusicalContextChanges('Go to 140bpm', DEFAULT_CTX);
    expect(result?.bpm).toBe(140);
  });

  it('clamps below 60', () => {
    const result = parseMusicalContextChanges('BPM 30', DEFAULT_CTX);
    expect(result?.bpm).toBe(60);
  });

  it('clamps above 300', () => {
    const result = parseMusicalContextChanges('BPM 400', DEFAULT_CTX);
    expect(result?.bpm).toBe(300);
  });

  it('"speed up" adds 15', () => {
    const result = parseMusicalContextChanges('speed up', DEFAULT_CTX);
    expect(result?.bpm).toBe(135);
  });

  it('"faster" adds 15', () => {
    const result = parseMusicalContextChanges('Make it faster', DEFAULT_CTX);
    expect(result?.bpm).toBe(135);
  });

  it('"slow down" subtracts 15', () => {
    const result = parseMusicalContextChanges('slow down a bit', DEFAULT_CTX);
    expect(result?.bpm).toBe(105);
  });

  it('"slower" subtracts 15', () => {
    const result = parseMusicalContextChanges('Go slower', DEFAULT_CTX);
    expect(result?.bpm).toBe(105);
  });

  it('"half time" halves BPM', () => {
    const result = parseMusicalContextChanges('half time feel', DEFAULT_CTX);
    expect(result?.bpm).toBe(60);
  });

  it('"double time" doubles BPM', () => {
    const result = parseMusicalContextChanges('double time!', DEFAULT_CTX);
    expect(result?.bpm).toBe(240);
  });

  it('half time clamps to minimum', () => {
    const ctx = { ...DEFAULT_CTX, bpm: 80 };
    const result = parseMusicalContextChanges('half time', ctx);
    expect(result?.bpm).toBe(60); // 80/2=40, clamped to 60
  });

  it('double time clamps to maximum', () => {
    const ctx = { ...DEFAULT_CTX, bpm: 200 };
    const result = parseMusicalContextChanges('double time', ctx);
    expect(result?.bpm).toBe(300); // 200*2=400, clamped to 300
  });
});

// ─── Energy Parsing ─────────────────────────────────────────────

describe('parseMusicalContextChanges — energy', () => {
  it('"energy 8"', () => {
    const result = parseMusicalContextChanges('energy 8', DEFAULT_CTX);
    expect(result?.energy).toBe(8);
  });

  it('"energy to 3"', () => {
    const result = parseMusicalContextChanges('Set energy to 3', DEFAULT_CTX);
    expect(result?.energy).toBe(3);
  });

  it('clamps energy below 1', () => {
    const result = parseMusicalContextChanges('energy 0', DEFAULT_CTX);
    expect(result?.energy).toBe(1);
  });

  it('clamps energy above 10', () => {
    const result = parseMusicalContextChanges('energy 15', DEFAULT_CTX);
    expect(result?.energy).toBe(10);
  });

  it('"more energy" adds 2', () => {
    const result = parseMusicalContextChanges('more energy', DEFAULT_CTX);
    expect(result?.energy).toBe(7);
  });

  it('"crank it" adds 2', () => {
    const result = parseMusicalContextChanges('crank it up', DEFAULT_CTX);
    expect(result?.energy).toBe(7);
  });

  it('"chill" subtracts 2', () => {
    const result = parseMusicalContextChanges('chill out', DEFAULT_CTX);
    expect(result?.energy).toBe(3);
  });

  it('"calmer" subtracts 2', () => {
    const result = parseMusicalContextChanges('make it calmer', DEFAULT_CTX);
    expect(result?.energy).toBe(3);
  });

  it('"full energy" sets to 10', () => {
    const result = parseMusicalContextChanges('full energy!', DEFAULT_CTX);
    expect(result?.energy).toBe(10);
  });

  it('"max energy" sets to 10', () => {
    const result = parseMusicalContextChanges('max energy now', DEFAULT_CTX);
    expect(result?.energy).toBe(10);
  });

  it('"minimal" sets to 1', () => {
    const result = parseMusicalContextChanges('Go minimal', DEFAULT_CTX);
    expect(result?.energy).toBe(1);
  });

  it('"more energy" clamps at 10', () => {
    const ctx = { ...DEFAULT_CTX, energy: 9 };
    const result = parseMusicalContextChanges('more energy', ctx);
    expect(result?.energy).toBe(10);
  });

  it('"chill" clamps at 1', () => {
    const ctx = { ...DEFAULT_CTX, energy: 1 };
    const result = parseMusicalContextChanges('chill', ctx);
    expect(result?.energy).toBe(1);
  });
});

// ─── Combined Directives ────────────────────────────────────────

describe('parseMusicalContextChanges — combined', () => {
  it('"Switch to D major, BPM 140, more energy"', () => {
    const result = parseMusicalContextChanges(
      'Switch to D major, BPM 140, more energy',
      DEFAULT_CTX
    );
    expect(result?.key).toBe('D major');
    expect(result?.bpm).toBe(140);
    expect(result?.energy).toBe(7);
    expect(result?.scale).toEqual(['D', 'E', 'F#', 'G', 'A', 'B', 'C#']);
  });

  it('"Faster and more energy"', () => {
    const result = parseMusicalContextChanges('Faster and more energy', DEFAULT_CTX);
    expect(result?.bpm).toBe(135);
    expect(result?.energy).toBe(7);
    expect(result?.key).toBeUndefined();
  });

  it('"Chill at 80 BPM in A minor"', () => {
    const result = parseMusicalContextChanges('Chill at 80 BPM in A minor', DEFAULT_CTX);
    expect(result?.energy).toBe(3); // chill → -2
    expect(result?.bpm).toBe(80);
    expect(result?.key).toBe('A minor');
  });
});

// ─── No-Match Cases ─────────────────────────────────────────────

describe('parseMusicalContextChanges — no match', () => {
  it('"more cowbell" returns null', () => {
    expect(parseMusicalContextChanges('more cowbell', DEFAULT_CTX)).toBeNull();
  });

  it('"play something funky" returns null', () => {
    expect(parseMusicalContextChanges('play something funky', DEFAULT_CTX)).toBeNull();
  });

  it('"add some reverb" returns null', () => {
    expect(parseMusicalContextChanges('add some reverb', DEFAULT_CTX)).toBeNull();
  });

  it('empty string returns null', () => {
    expect(parseMusicalContextChanges('', DEFAULT_CTX)).toBeNull();
  });
});
