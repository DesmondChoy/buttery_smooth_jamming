import { readFileSync } from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

import normal_mode_prompt_data from '../normal-mode-system-prompt-data.json';
import {
  load_normal_mode_system_prompt,
  NORMAL_MODE_VALIDITY_BEHAVIOR_PLACEHOLDER,
  render_normal_mode_system_prompt_template,
} from '../normal-mode-system-prompt';

const repo_root = process.cwd();
const normal_mode_prompt_template = readFileSync(
  path.join(repo_root, '.codex', 'agents', 'normal-mode-system-prompt.md'),
  'utf-8'
);
const strudel_skill_content = readFileSync(
  path.join(repo_root, '.codex', 'skills', 'strudel-validity-policy', 'SKILL.md'),
  'utf-8'
);

describe('normal mode system prompt template', () => {
  it('renders deterministically and replaces the placeholder', () => {
    const first = render_normal_mode_system_prompt_template(normal_mode_prompt_template);
    const second = render_normal_mode_system_prompt_template(normal_mode_prompt_template);

    expect(first).toBe(second);
    expect(first).not.toContain(NORMAL_MODE_VALIDITY_BEHAVIOR_PLACEHOLDER);
    expect(first).toContain('## MCP Tools');
    expect(first).toContain('## Behavior');
  });

  it('requires exactly one placeholder in the template', () => {
    const placeholder_count =
      normal_mode_prompt_template.split(NORMAL_MODE_VALIDITY_BEHAVIOR_PLACEHOLDER).length - 1;

    expect(placeholder_count).toBe(1);
    expect(() => render_normal_mode_system_prompt_template('## Behavior\n- no placeholder here')).toThrow(
      /missing placeholder/i
    );
    expect(() =>
      render_normal_mode_system_prompt_template(
        `${NORMAL_MODE_VALIDITY_BEHAVIOR_PLACEHOLDER}\n${NORMAL_MODE_VALIDITY_BEHAVIOR_PLACEHOLDER}`
      )
    ).toThrow(/exactly one placeholder/i);
  });

  it('keeps canonical strudel-validity anchors represented in condensed normal-mode guidance', () => {
    const rendered_prompt = load_normal_mode_system_prompt(repo_root);

    const cases = [
      {
        skill_anchor: 'host JS globals',
        prompt_anchor:
          'Generate canonical Strudel only: use documented methods from the Strudel reference, and avoid invented methods or host JS globals.',
      },
      {
        skill_anchor: 'Start from a valid root expression:',
        prompt_anchor:
          'Use valid roots: note(...), s(...), sound(...), stack(...), cat(...), seq(...), or silence.',
      },
      {
        skill_anchor: '.wave("saw")',
        prompt_anchor:
          'Prefer canonical mappings like .s("sawtooth"), .bpf(...), and .pan(sine.range(0,1)); never use .wave().',
      },
      {
        skill_anchor: 'favor documented methods from the shared Strudel reference',
        prompt_anchor:
          'Generate canonical Strudel only: use documented methods from the Strudel reference, and avoid invented methods or host JS globals.',
      },
    ] as const;

    for (const test_case of cases) {
      expect(strudel_skill_content).toContain(test_case.skill_anchor);
      expect(normal_mode_prompt_data.validity_behavior_bullets).toContain(test_case.prompt_anchor);
      expect(rendered_prompt).toContain(test_case.prompt_anchor);
    }
  });

  it('preserves the normal-mode tool contract and concise behavior wording', () => {
    const rendered_prompt = load_normal_mode_system_prompt(repo_root);

    const required_lines = [
      '- execute_pattern(code) - send Strudel code to the web app for playback',
      '- stop_pattern() - stop playback',
      '- send_message(text) - display a chat message in the web app',
      '- Interpret relative tempo and energy directives musically and contextually; avoid drastic tempo jumps unless explicitly requested.',
      '- Briefly explain what changed and why. Keep responses concise.',
    ] as const;

    for (const line of required_lines) {
      expect(rendered_prompt).toContain(line);
    }
  });
});
