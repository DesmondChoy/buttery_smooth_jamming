import { describe, it, expect } from 'vitest';
import { parsePattern, summarizePattern } from '../pattern-parser';

// ─── Test corpus from .claude/agents/*.md ────────────────────────────

describe('parsePattern', () => {
  it('parses a simple s() pattern', () => {
    const result = parsePattern('s("bd ~ sd ~").bank("RolandTR909").gain(0.5)');
    expect(result).not.toBeNull();
    expect(result!.structure).toBe('single');
    expect(result!.layers).toHaveLength(1);
    expect(result!.layers[0].source).toBe('s');
    expect(result!.layers[0].content).toEqual(['bd', 'sd']);
    expect(result!.layers[0].effects.bank).toBe('RolandTR909');
    expect(result!.layers[0].effects.gain).toBe(0.5);
  });

  it('parses a note() pattern with synth', () => {
    const result = parsePattern('note("c1 ~ eb1 g1").s("sawtooth").lpf(600).gain(0.6)');
    expect(result).not.toBeNull();
    expect(result!.structure).toBe('single');
    expect(result!.layers[0].source).toBe('note');
    expect(result!.layers[0].content).toEqual(['c1', 'eb1', 'g1']);
    expect(result!.layers[0].effects.s).toBe('sawtooth');
    expect(result!.layers[0].effects.lpf).toBe(600);
    expect(result!.layers[0].effects.gain).toBe(0.6);
  });

  it('parses a stack() with multiple layers', () => {
    const result = parsePattern(
      'stack(s("bd [~ bd] sd [bd ~]").bank("RolandTR909"), s("hh*4").gain(0.5).sometimes(x => x.gain(0.3)), s("~ ~ ~ cp").every(4, x => x.s("cr")))'
    );
    expect(result).not.toBeNull();
    expect(result!.structure).toBe('stack');
    expect(result!.layers).toHaveLength(3);

    // Layer 1: kick + snare
    expect(result!.layers[0].source).toBe('s');
    expect(result!.layers[0].content).toEqual(['bd', 'sd']);
    expect(result!.layers[0].effects.bank).toBe('RolandTR909');

    // Layer 2: hihats
    expect(result!.layers[1].content).toEqual(['hh']);
    expect(result!.layers[1].effects.gain).toBe(0.5);
    expect(result!.layers[1].modifiers).toContain('sometimes');

    // Layer 3: clap
    expect(result!.layers[2].content).toEqual(['cp']);
    expect(result!.layers[2].modifiers).toContain('every(4)');
  });

  it('extracts modifiers with values', () => {
    const result = parsePattern('s("hh?").room(0.9).hpf(400).gain(0.3).degradeBy(0.7).slow(2)');
    expect(result).not.toBeNull();
    const layer = result!.layers[0];
    expect(layer.modifiers).toContain('degradeBy(0.7)');
    expect(layer.modifiers).toContain('slow(2)');
  });

  it('handles euclid modifier', () => {
    const result = parsePattern('s("hh").euclid(5,8)');
    expect(result).not.toBeNull();
    expect(result!.layers[0].modifiers).toContain('euclid(5,8)');
  });

  it('handles fast modifier with value', () => {
    const result = parsePattern('note("c1 eb1 f1 g1").s("sawtooth").fast(2)');
    expect(result).not.toBeNull();
    expect(result!.layers[0].modifiers).toContain('fast(2)');
  });

  it('returns null for silence', () => {
    expect(parsePattern('silence')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parsePattern('')).toBeNull();
  });

  it('returns null for malformed code', () => {
    expect(parsePattern('this is not valid((')).toBeNull();
  });
});

// ─── summarizePattern ─────────────────────────────────────────────

describe('summarizePattern', () => {
  // Edge cases
  it('returns null for silence', () => {
    expect(summarizePattern('silence')).toBeNull();
  });

  it('returns null for no_change', () => {
    expect(summarizePattern('no_change')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(summarizePattern('')).toBeNull();
  });

  it('returns null for malformed code', () => {
    expect(summarizePattern('not valid((')).toBeNull();
  });

  // Drummer patterns (from drummer.md)
  describe('drummer patterns', () => {
    it('low energy — sparse kit', () => {
      const result = summarizePattern('stack(s("bd ~ ~ ~").bank("RolandTR909"), s("~ ~ hh ~").gain(0.4))');
      expect(result).not.toBeNull();
      expect(result).toContain('2 layers');
      expect(result).toContain('bd');
      expect(result).toContain('TR909');
      expect(result).toContain('hh');
    });

    it('high energy — syncopated', () => {
      const result = summarizePattern(
        'stack(s("bd [~ bd] sd [bd ~]").bank("RolandTR909"), s("hh*4").gain(0.5).sometimes(x => x.gain(0.3)), s("~ ~ ~ cp").every(4, x => x.s("cr")))'
      );
      expect(result).toContain('3 layers');
      expect(result).toContain('bd');
      expect(result).toContain('sd');
      expect(result).toContain('hh');
      expect(result).toContain('cp');
    });

    it('mid energy with tom fill', () => {
      const result = summarizePattern(
        'stack(s("bd ~ sd ~").bank("RolandTR909"), s("hh*4").gain(0.5), s("~ ~ ~ ~").every(4, x => x.s("tom").gain(0.6)))'
      );
      expect(result).toContain('3 layers');
    });
  });

  // Bassist patterns (from bassist.md)
  describe('bassist patterns', () => {
    it('low energy — root note only', () => {
      const result = summarizePattern('note("c1 ~ ~ ~").s("triangle").lpf(500).gain(0.6)');
      expect(result).toContain('c1');
      expect(result).toContain('triangle');
      expect(result).toContain('lpf 500');
    });

    it('mid energy — chord tones', () => {
      const result = summarizePattern('note("c1 ~ eb1 g1").s("sawtooth").lpf(600).gain(0.6)');
      expect(result).toContain('c1');
      expect(result).toContain('eb1');
      expect(result).toContain('g1');
      expect(result).toContain('sawtooth');
    });

    it('high energy — walking bass', () => {
      const result = summarizePattern(
        'note("c1 c2 eb1 g1 f1 f2 g1 ab1").s("sawtooth").lpf(700).gain(0.7).sometimes(x => x.note("c2"))'
      );
      expect(result).toContain('c1');
      expect(result).toContain('sawtooth');
      expect(result).toContain('sometimes');
    });

    it('bass solo with fast', () => {
      const result = summarizePattern(
        'note("c1 eb1 f1 g1 ab1 g1 f1 eb1").s("sawtooth").lpf(800).gain(0.7).fast(2).sometimes(x => x.note("c2"))'
      );
      expect(result).toContain('fast(2)');
      expect(result).toContain('sometimes');
    });
  });

  // Melody patterns (from melody.md)
  describe('melody patterns', () => {
    it('low energy — sparse sustained', () => {
      const result = summarizePattern(
        'note("eb4 ~ ~ g4 ~ ~ ~ ~").s("sine").room(0.5).gain(0.5).slow(2)'
      );
      expect(result).toContain('eb4');
      expect(result).toContain('g4');
      expect(result).toContain('sine');
      expect(result).toContain('slow(2)');
    });

    it('high energy — descending scale', () => {
      const result = summarizePattern(
        'note("c5 bb4 ab4 g4 f4 eb4 d4 c4").s("piano").room(0.3).gain(0.7).sometimes(x => x.fast(2))'
      );
      expect(result).toContain('c5');
      expect(result).toContain('piano');
      expect(result).toContain('sometimes');
    });

    it('arpeggiated in C minor', () => {
      const result = summarizePattern(
        'note("eb4 g4 bb4 c5 g4 eb4").s("piano").room(0.3).gain(0.6)'
      );
      expect(result).toContain('eb4');
      expect(result).toContain('g4');
      expect(result).toContain('piano');
    });
  });

  // FX patterns (from fx-artist.md)
  describe('fx patterns', () => {
    it('low energy — ambient', () => {
      const result = summarizePattern(
        's("hh?").room(0.9).hpf(400).gain(0.3).degradeBy(0.7).pan(sine.range(0,1)).slow(2)'
      );
      expect(result).toContain('hh');
      expect(result).toContain('room 0.9');
      expect(result).toContain('hpf 400');
      expect(result).toContain('degradeBy(0.7)');
    });

    it('mid energy — rhythmic effects', () => {
      const result = summarizePattern(
        's("cp?").delay(0.5).room(0.5).hpf(400).gain(0.4).degradeBy(0.4).pan(sine.range(0.2,0.8))'
      );
      expect(result).toContain('cp');
      expect(result).toContain('delay 0.5');
      expect(result).toContain('degradeBy(0.4)');
    });

    it('high energy — full chaos stack', () => {
      const result = summarizePattern(
        'stack(s("cp*4").crush(4).distort(2).hpf(300).pan(sine.range(0,1)).gain(0.6), s("rim?").coarse(8).delay(0.25).hpf(500).degradeBy(0.4).fast(2))'
      );
      expect(result).toContain('2 layers');
      expect(result).toContain('cp');
      expect(result).toContain('crush 4');
      expect(result).toContain('distort 2');
      expect(result).toContain('rim');
      expect(result).toContain('delay 0.25');
    });
  });

  // Performance: all patterns should parse in <1ms each
  describe('performance', () => {
    const patterns = [
      'stack(s("bd [~ bd] sd [bd ~]").bank("RolandTR909"), s("hh*4").gain(0.5).sometimes(x => x.gain(0.3)), s("~ ~ ~ cp").every(4, x => x.s("cr")))',
      'note("c1 ~ eb1 g1").s("sawtooth").lpf(600).gain(0.6)',
      'note("c5 bb4 ab4 g4 f4 eb4 d4 c4").s("piano").room(0.3).gain(0.7).sometimes(x => x.fast(2))',
      'stack(s("cp*4").crush(4).distort(2).hpf(300).pan(sine.range(0,1)).gain(0.6), s("rim?").coarse(8).delay(0.25).hpf(500).degradeBy(0.4).fast(2))',
      's("hh?").room(0.9).hpf(400).gain(0.3).degradeBy(0.7).pan(sine.range(0,1)).slow(2)',
    ];

    it('parses all patterns in under 5ms total', () => {
      const start = performance.now();
      for (const p of patterns) {
        summarizePattern(p);
      }
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(5);
    });
  });
});
