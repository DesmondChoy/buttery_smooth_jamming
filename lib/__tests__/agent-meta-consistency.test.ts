import { describe, it, expect } from 'vitest';
import { AGENT_META } from '../types';

describe('AGENT_META consistency', () => {
  it('has exactly the expected agent keys', () => {
    expect(Object.keys(AGENT_META).sort()).toEqual(['bass', 'chords', 'drums', 'melody']);
  });

  it('every agent has required metadata fields', () => {
    for (const [key, meta] of Object.entries(AGENT_META)) {
      expect(meta.key).toBe(key);
      expect(meta.name).toBeTruthy();
      expect(meta.emoji).toBeTruthy();
      expect(meta.mention).toMatch(/^@/);
      expect(meta.colors).toBeDefined();
      expect(meta.colors.border).toBeTruthy();
      expect(meta.colors.accent).toBeTruthy();
      expect(meta.colors.bg).toBeTruthy();
      expect(meta.colors.bgSolid).toBeTruthy();
    }
  });

  it('agent names are unique', () => {
    const names = Object.values(AGENT_META).map(m => m.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('agent emojis are unique', () => {
    const emojis = Object.values(AGENT_META).map(m => m.emoji);
    expect(new Set(emojis).size).toBe(emojis.length);
  });

  it('uses canonical mention tokens for deterministic routing', () => {
    expect(AGENT_META.drums.mention).toBe('@BEAT');
    expect(AGENT_META.bass.mention).toBe('@GROOVE');
    expect(AGENT_META.melody.mention).toBe('@ARIA');
    expect(AGENT_META.chords.mention).toBe('@CHORDS');
  });
});
