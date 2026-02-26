import { describe, expect, it } from 'vitest';

import type { MusicalContext } from '../types';
import {
  buildAutoTickManagerContext,
  buildDirectiveManagerContext,
  buildJamStartManagerContext,
} from '../jam-manager-context-templates';

const musicalContext: MusicalContext = {
  genre: 'Dark Ambient',
  key: 'C minor',
  scale: ['C', 'D', 'Eb', 'F', 'G', 'Ab', 'Bb'],
  chordProgression: ['Cm', 'Ab', 'Eb', 'Bb'],
  bpm: 120,
  timeSignature: '4/4',
  energy: 5,
};

describe('jam manager context templates', () => {
  it('renders jam-start opening context phrasing and structure', () => {
    const rendered = buildJamStartManagerContext({
      roundNumber: 1,
      musicalContext,
      bandStateLines: [
        '🥁 Drums (drums): [first round — no pattern yet]',
        '🎸 Bass (bass): [first round — no pattern yet]',
      ],
    });

    expect(rendered).toContain('JAM START — CONTEXT');
    expect(rendered).toContain('Round: 1 (opening)');
    expect(rendered).toContain('BAND STATE:');
    expect(rendered).toContain('BOSS SAYS: No directives — free jam. Create your opening pattern.');
    expect(rendered).toContain('YOUR LAST PATTERN: None yet — this is your first round.');
  });

  it('renders directive context with broadcast boss phrasing', () => {
    const rendered = buildDirectiveManagerContext({
      roundNumber: 3,
      musicalContext,
      directive: 'Build tension slowly',
      isBroadcast: true,
      currentPattern: 's("bd sd")',
      bandStateLines: ['🎹 Melody (melody): note("c3 eb3 g3")'],
    });

    expect(rendered).toContain('DIRECTIVE from the boss.');
    expect(rendered).toContain('BOSS SAYS: Build tension slowly');
    expect(rendered).not.toContain('BOSS SAYS TO YOU:');
    expect(rendered).toContain('Respond with your updated pattern.');
  });

  it('renders directive context with targeted boss phrasing', () => {
    const rendered = buildDirectiveManagerContext({
      roundNumber: 4,
      musicalContext,
      directive: 'Lay back',
      isBroadcast: false,
      currentPattern: 's("bd sd")',
      bandStateLines: ['🎸 Bass (bass): note("c2")'],
    });

    expect(rendered).toContain('BOSS SAYS TO YOU: Lay back');
    expect(rendered).not.toContain('BOSS SAYS: Lay back');
  });

  it('renders auto-tick evolution guidance including no_change and decision hint', () => {
    const rendered = buildAutoTickManagerContext({
      roundNumber: 5,
      musicalContext,
      currentPattern: 's("bd sd")',
      bandStateLines: ['🌀 FX (fx): silence'],
    });

    expect(rendered).toContain('AUTO-TICK — LISTEN AND EVOLVE');
    expect(rendered).toContain('If your groove serves the song, respond with "no_change" as your pattern.');
    expect(rendered).toContain('Include a decision block if you feel the musical context should evolve.');
  });

  it('renders deterministically for identical inputs', () => {
    const input = {
      roundNumber: 8,
      musicalContext,
      currentPattern: 'no_change',
      bandStateLines: ['🥁 Drums (drums): s("bd")'],
    };

    const first = buildAutoTickManagerContext(input);
    const second = buildAutoTickManagerContext(input);

    expect(second).toBe(first);
  });
});
