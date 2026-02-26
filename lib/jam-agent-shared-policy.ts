/**
 * Condensed shared jam policy derived from:
 * - .codex/skills/jam-musical-policy/SKILL.md
 * - .codex/skills/strudel-validity-policy/SKILL.md
 *
 * Keep this layer concise so per-agent system prompts remain deterministic
 * and token-bounded while preserving the v3 model/code policy boundary.
 */

const JAM_MUSICAL_POLICY_LINES = [
  'Respect the v3 boundary: model owns musical interpretation and expression; code owns routing, lifecycle, and final composition guarantees.',
  'Resolve tempo intent in strict order: explicit BPM > half/double time > model-relative feel.',
  'Match change size to directive strength and protect continuity; when ambiguous, prefer minimal change or "no_change".',
  'Realize energy and arrangement intent by role without one-turn overshoot unless explicitly requested.',
] as const;

const STRUDEL_VALIDITY_POLICY_LINES = [
  'Generate canonical Strudel only: avoid invented methods and host JS globals.',
  'Use valid roots: note(...), s(...), sound(...), stack(...), cat(...), seq(...), or silence.',
  'Prefer canonical mappings like .s("sawtooth"), .bpf(...), and .pan(sine.range(0,1)).',
  'Jam output must be exactly one JSON object with keys pattern, thoughts, reaction.',
  'If syntax confidence is low, use "no_change" instead of speculative invalid code.',
] as const;

function buildPolicySection(tag: string, lines: readonly string[]): string {
  return [
    `<${tag}>`,
    ...lines.map((line) => `- ${line}`),
    `</${tag}>`,
  ].join('\n');
}

export function buildSharedJamPolicyPrompt(): string {
  return [
    buildPolicySection('jam_musical_policy', JAM_MUSICAL_POLICY_LINES),
    '',
    buildPolicySection('strudel_validity_policy', STRUDEL_VALIDITY_POLICY_LINES),
  ].join('\n');
}

export const SHARED_JAM_POLICY_PROMPT = buildSharedJamPolicyPrompt();
