import { describe, it, expect } from 'vitest';
import { PRESETS, randomMusicalContext } from '../musical-context-presets';
import { deriveScale } from '../musical-context-parser';
import { JAM_GOVERNANCE } from '../jam-governance-constants';

describe('musical-context-presets', () => {
  describe('PRESETS validity', () => {
    it('has at least 16 presets', () => {
      expect(PRESETS.length).toBeGreaterThanOrEqual(16);
    });

    it.each(PRESETS.map((p, i) => [i, p.genre, p] as const))(
      'preset %i (%s) produces a valid 7-note scale',
      (_index, _genre, preset) => {
        const scale = preset.scale ?? deriveScale(preset.key);
        expect(scale).not.toBeNull();
        expect(scale).toHaveLength(7);
      }
    );

    it.each(PRESETS.map((p, i) => [i, p.genre, p] as const))(
      'preset %i (%s) has BPM in [BPM_MIN, BPM_MAX]',
      (_index, _genre, preset) => {
        expect(preset.bpm).toBeGreaterThanOrEqual(JAM_GOVERNANCE.BPM_MIN);
        expect(preset.bpm).toBeLessThanOrEqual(JAM_GOVERNANCE.BPM_MAX);
      }
    );

    it.each(PRESETS.map((p, i) => [i, p.genre, p] as const))(
      'preset %i (%s) has energy in [ENERGY_MIN, ENERGY_MAX]',
      (_index, _genre, preset) => {
        expect(preset.energy).toBeGreaterThanOrEqual(JAM_GOVERNANCE.ENERGY_MIN);
        expect(preset.energy).toBeLessThanOrEqual(JAM_GOVERNANCE.ENERGY_MAX);
      }
    );
  });

  describe('modal key scales', () => {
    it('D dorian preset has correct scale', () => {
      const funk = PRESETS.find((p) => p.genre === 'Funk');
      expect(funk).toBeDefined();
      expect(funk!.scale).toEqual(['D', 'E', 'F', 'G', 'A', 'B', 'C']);
    });

    it('A mixolydian preset has correct scale', () => {
      const mixo = PRESETS.find((p) => p.genre === 'Mixolydian Rock');
      expect(mixo).toBeDefined();
      expect(mixo!.scale).toEqual(['A', 'B', 'C#', 'D', 'E', 'F#', 'G']);
    });
  });

  describe('randomMusicalContext()', () => {
    it('returns a valid MusicalContext shape', () => {
      const ctx = randomMusicalContext();
      expect(typeof ctx.genre).toBe('string');
      expect(ctx.genre.length).toBeGreaterThan(0);
      expect(typeof ctx.key).toBe('string');
      expect(Array.isArray(ctx.scale)).toBe(true);
      expect(ctx.scale).toHaveLength(7);
      expect(Array.isArray(ctx.chordProgression)).toBe(true);
      expect(ctx.chordProgression.length).toBeGreaterThan(0);
      expect(typeof ctx.bpm).toBe('number');
      expect(typeof ctx.timeSignature).toBe('string');
      expect(typeof ctx.energy).toBe('number');
    });

    it('produces at least 3 distinct keys in 50 calls', () => {
      const keys = new Set<string>();
      for (let i = 0; i < 50; i++) {
        keys.add(randomMusicalContext().key);
      }
      expect(keys.size).toBeGreaterThanOrEqual(3);
    });
  });
});
