import * as fs from 'fs';
import * as path from 'path';

import normal_mode_system_prompt_data from './normal-mode-system-prompt-data.json';

const NORMAL_MODE_SYSTEM_PROMPT_FILE = 'normal-mode-system-prompt.md';
const NORMAL_MODE_PROMPT_DIR_CANDIDATES = [
  ['.codex', 'agents'],
] as const;

export const NORMAL_MODE_VALIDITY_BEHAVIOR_PLACEHOLDER =
  '{{NORMAL_MODE_VALIDITY_BEHAVIOR_BULLETS}}';

function resolve_normal_mode_prompt_path(root_dir: string): string | null {
  for (const segments of NORMAL_MODE_PROMPT_DIR_CANDIDATES) {
    const candidate = path.join(root_dir, ...segments, NORMAL_MODE_SYSTEM_PROMPT_FILE);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function count_occurrences(value: string, needle: string): number {
  if (!needle) return 0;
  return value.split(needle).length - 1;
}

function get_validity_behavior_bullets(): string[] {
  const { validity_behavior_bullets } = normal_mode_system_prompt_data;
  if (!Array.isArray(validity_behavior_bullets) || validity_behavior_bullets.length === 0) {
    throw new Error('Normal mode prompt validity behavior bullets must be a non-empty array.');
  }

  return validity_behavior_bullets.map((line, index) => {
    if (typeof line !== 'string') {
      throw new Error(
        `Normal mode prompt validity behavior bullet at index ${index} must be a string.`
      );
    }
    const trimmed = line.trim();
    if (!trimmed) {
      throw new Error(
        `Normal mode prompt validity behavior bullet at index ${index} must not be blank.`
      );
    }
    return trimmed;
  });
}

export function render_normal_mode_system_prompt_template(template: string): string {
  const placeholder_count = count_occurrences(
    template,
    NORMAL_MODE_VALIDITY_BEHAVIOR_PLACEHOLDER
  );

  if (placeholder_count === 0) {
    throw new Error(
      `Normal mode system prompt template missing placeholder: ${NORMAL_MODE_VALIDITY_BEHAVIOR_PLACEHOLDER}`
    );
  }

  if (placeholder_count > 1) {
    throw new Error(
      `Normal mode system prompt template must contain exactly one placeholder: ${NORMAL_MODE_VALIDITY_BEHAVIOR_PLACEHOLDER}`
    );
  }

  const rendered = template.replace(
    NORMAL_MODE_VALIDITY_BEHAVIOR_PLACEHOLDER,
    get_validity_behavior_bullets().map((line) => `- ${line}`).join('\n')
  ).trim();

  if (!rendered) {
    throw new Error('Normal mode system prompt is empty after rendering template.');
  }

  return rendered;
}

export function load_normal_mode_system_prompt(working_dir: string): string {
  const search_roots = [working_dir, process.cwd()];
  const visited = new Set<string>();
  const attempted_paths: string[] = [];

  for (const root of search_roots) {
    if (!root || visited.has(root)) continue;
    visited.add(root);
    for (const segments of NORMAL_MODE_PROMPT_DIR_CANDIDATES) {
      attempted_paths.push(path.join(root, ...segments, NORMAL_MODE_SYSTEM_PROMPT_FILE));
    }
    const prompt_path = resolve_normal_mode_prompt_path(root);
    if (!prompt_path) continue;

    const template = fs.readFileSync(prompt_path, 'utf-8').trim();
    if (!template) {
      throw new Error(`Normal mode system prompt is empty: ${prompt_path}`);
    }
    return render_normal_mode_system_prompt_template(template);
  }

  throw new Error(
    `Normal mode system prompt not found. Tried: ${attempted_paths.join(', ')}`
  );
}
