import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import * as path from 'path';

import shared_jam_policy_data from '../jam-agent-shared-policy-data.json';
import { buildSharedJamPolicyPrompt } from '../jam-agent-shared-policy';

const repo_root = process.cwd();
const jam_skill_content = readFileSync(
  path.join(repo_root, '.codex', 'skills', 'jam-musical-policy', 'SKILL.md'),
  'utf-8'
);
const strudel_skill_content = readFileSync(
  path.join(repo_root, '.codex', 'skills', 'strudel-validity-policy', 'SKILL.md'),
  'utf-8'
);

describe('shared jam policy prompt', () => {
  it('renders deterministic policy sections in stable order', () => {
    const first = buildSharedJamPolicyPrompt();
    const second = buildSharedJamPolicyPrompt();

    expect(first).toContain('<jam_musical_policy>');
    expect(first).toContain('</jam_musical_policy>');
    expect(first).toContain('<strudel_validity_policy>');
    expect(first).toContain('</strudel_validity_policy>');

    expect(first.indexOf('<jam_musical_policy>')).toBeLessThan(
      first.indexOf('<strudel_validity_policy>')
    );
    expect(second).toBe(first);
  });

  it('uses non-empty string arrays in the condensed policy data file', () => {
    expect(Array.isArray(shared_jam_policy_data.jam_musical_policy)).toBe(true);
    expect(shared_jam_policy_data.jam_musical_policy.length).toBeGreaterThan(0);
    expect(shared_jam_policy_data.jam_musical_policy.every((line) => typeof line === 'string')).toBe(true);

    expect(Array.isArray(shared_jam_policy_data.strudel_validity_policy)).toBe(true);
    expect(shared_jam_policy_data.strudel_validity_policy.length).toBeGreaterThan(0);
    expect(
      shared_jam_policy_data.strudel_validity_policy.every((line) => typeof line === 'string')
    ).toBe(true);
  });

  it('keeps targeted skill anchors represented in condensed policy and rendered prompt', () => {
    const rendered_prompt = buildSharedJamPolicyPrompt();

    const cases = [
      {
        skill_name: 'jam-musical-policy',
        skill_content: jam_skill_content,
        skill_anchor:
          'Rule: preserve this boundary. Keep creative choices model-owned and runtime guarantees code-owned.',
        condensed_anchor:
          'Respect the v3 boundary: model owns musical interpretation and expression; code owns routing, lifecycle, and final composition guarantees.',
      },
      {
        skill_name: 'jam-musical-policy',
        skill_content: jam_skill_content,
        skill_anchor: 'explicit BPM > half/double time > model-relative tempo intent',
        condensed_anchor:
          'Resolve tempo intent in strict order: explicit BPM > half/double time > model-relative feel.',
      },
      {
        skill_name: 'jam-musical-policy',
        skill_content: jam_skill_content,
        skill_anchor:
          'When ambiguous or low confidence, choose continuity-first behavior (`no_change` or minimal delta), not a hard reset.',
        condensed_anchor:
          'Match change size to directive strength and protect continuity; when ambiguous, prefer minimal change or "no_change".',
      },
      {
        skill_name: 'strudel-validity-policy',
        skill_content: strudel_skill_content,
        skill_anchor: 'host JS globals',
        condensed_anchor:
          'Generate canonical Strudel only: avoid invented methods and host JS globals.',
      },
      {
        skill_name: 'strudel-validity-policy',
        skill_content: strudel_skill_content,
        skill_anchor: 'Start from a valid root expression:',
        condensed_anchor:
          'Use valid roots: note(...), s(...), sound(...), stack(...), cat(...), seq(...), or silence.',
      },
      {
        skill_name: 'strudel-validity-policy',
        skill_content: strudel_skill_content,
        skill_anchor: 'optional `commentary` and `decision` objects may be included when relevant.',
        condensed_anchor:
          'Jam output must be exactly one JSON object with required keys pattern and thoughts; optional commentary and decision may be included when relevant.',
      },
      {
        skill_name: 'strudel-validity-policy',
        skill_content: strudel_skill_content,
        skill_anchor: 'prefer `no_change` over speculative invalid syntax',
        condensed_anchor:
          'If syntax confidence is low, use "no_change" instead of speculative invalid code.',
      },
    ] as const;

    const condensed_lines = [
      ...shared_jam_policy_data.jam_musical_policy,
      ...shared_jam_policy_data.strudel_validity_policy,
    ].join('\n');

    for (const test_case of cases) {
      expect(test_case.skill_content).toContain(test_case.skill_anchor);
      expect(condensed_lines).toContain(test_case.condensed_anchor);
      expect(rendered_prompt).toContain(test_case.condensed_anchor);
    }
  });
});
