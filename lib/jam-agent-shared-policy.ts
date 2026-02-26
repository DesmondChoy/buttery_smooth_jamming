/**
 * Condensed shared jam policy derived from:
 * - .codex/skills/jam-musical-policy/SKILL.md
 * - .codex/skills/strudel-validity-policy/SKILL.md
 *
 * Keep this layer concise so per-agent system prompts remain deterministic
 * and token-bounded while preserving the v3 model/code policy boundary.
 */

import shared_jam_policy_data from './jam-agent-shared-policy-data.json';

const { jam_musical_policy, strudel_validity_policy } = shared_jam_policy_data;

function buildPolicySection(tag: string, lines: readonly string[]): string {
  return [
    `<${tag}>`,
    ...lines.map((line) => `- ${line}`),
    `</${tag}>`,
  ].join('\n');
}

export function buildSharedJamPolicyPrompt(): string {
  return [
    buildPolicySection('jam_musical_policy', jam_musical_policy),
    '',
    buildPolicySection('strudel_validity_policy', strudel_validity_policy),
  ].join('\n');
}

export const SHARED_JAM_POLICY_PROMPT = buildSharedJamPolicyPrompt();
