import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export const CODEX_NORMAL_PROFILE = 'normal_mode';
export const CODEX_JAM_PROFILE = 'jam_agent';

const REQUIRED_PROFILES = [CODEX_NORMAL_PROFILE, CODEX_JAM_PROFILE] as const;
const REQUIRED_MCP_SERVERS = ['strudel'] as const;
const SUCCESS_CACHE_TTL_MS = 30000;
const PATH_WARNING_PREFIX = 'WARNING: proceeding, even though we could not update PATH:';

export type CodexRuntimeCheckErrorCode =
  | 'config_missing'
  | 'binary_missing'
  | 'auth_missing'
  | 'profile_missing'
  | 'mcp_missing'
  | 'runtime_unavailable';

export class CodexRuntimeCheckError extends Error {
  readonly code: CodexRuntimeCheckErrorCode;

  constructor(code: CodexRuntimeCheckErrorCode, message: string) {
    super(message);
    this.name = 'CodexRuntimeCheckError';
    this.code = code;
  }
}

interface CommandResult {
  exit_code: number | null;
  stdout: string;
  stderr: string;
  error?: NodeJS.ErrnoException;
}

export interface ProjectCodexConfig {
  config_path: string;
  normal_mode_model: string;
  jam_agent_model: string;
  normal_mode_reasoning_effort: string;
  jam_agent_reasoning_effort: string;
  normal_mode_reasoning_summary: string;
  jam_agent_reasoning_summary: string;
}

export type RunCodexCommand = (
  args: string[],
  options: { working_dir: string; config_overrides: string[] }
) => Promise<CommandResult>;

export interface CodexRuntimeCheckOptions {
  working_dir: string;
  required_profiles?: string[];
  required_mcp_servers?: string[];
  run_command?: RunCodexCommand;
  force?: boolean;
}

const success_cache = new Map<string, number>();
const DEFAULT_MODEL_REASONING_EFFORT = 'low';
const DEFAULT_MODEL_REASONING_SUMMARY = 'detailed';

function quote_toml_string(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function sanitize_output(text: string): string {
  return text
    .split('\n')
    .filter((line) => !line.startsWith(PATH_WARNING_PREFIX))
    .join('\n')
    .trim();
}

function combine_output(result: CommandResult): string {
  return sanitize_output([result.stdout, result.stderr].filter(Boolean).join('\n')).trim();
}

function format_failure_details(result: CommandResult): string {
  const details = combine_output(result);
  return details || '(no output)';
}

function profile_not_found(output: string, profile: string): boolean {
  const lowered_output = output.toLowerCase();
  const lowered_profile = profile.toLowerCase();
  return (
    lowered_output.includes(`config profile \`${lowered_profile}\` not found`)
    || lowered_output.includes(`config profile '${lowered_profile}' not found`)
    || lowered_output.includes(`config profile "${lowered_profile}" not found`)
    || lowered_output.includes(`config profile ${lowered_profile} not found`)
  );
}

function profile_probe_schema_path(config: ProjectCodexConfig, profile: string): string {
  const ts = Date.now();
  const config_dir = path.dirname(config.config_path);
  return path.join(config_dir, `__codex_profile_probe_${profile}_${process.pid}_${ts}.schema.json`);
}

function profile_probe_passed(output: string, probe_path: string): boolean {
  if (!output) return false;
  const lowered = output.toLowerCase();
  return lowered.includes('output schema') && lowered.includes(path.basename(probe_path).toLowerCase());
}

function cache_key(options: CodexRuntimeCheckOptions): string {
  const profiles = (options.required_profiles ?? [...REQUIRED_PROFILES]).join(',');
  const mcp_servers = (options.required_mcp_servers ?? [...REQUIRED_MCP_SERVERS]).join(',');
  return `${options.working_dir}|${profiles}|${mcp_servers}`;
}

export function resolve_project_codex_config_path(working_dir: string): string | null {
  const preferred = path.join(working_dir, '.codex', 'config.toml');
  if (fs.existsSync(preferred)) return preferred;

  const fallback = path.join(working_dir, 'config', 'codex', 'config.toml');
  if (fs.existsSync(fallback)) return fallback;

  return null;
}

function extract_profile_model(config_text: string, profile: string): string | null {
  return extract_profile_string(config_text, profile, 'model');
}

function extract_profile_string(
  config_text: string,
  profile: string,
  key: string
): string | null {
  const lines = config_text.split(/\r?\n/);
  const section_header = `[profiles.${profile}]`;
  let in_section = false;

  for (const raw_line of lines) {
    const line = raw_line.trim();
    if (!line) continue;

    if (line.startsWith('[') && line.endsWith(']')) {
      in_section = line === section_header;
      continue;
    }

    if (!in_section) continue;

    const key_match = line.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"\\s*$`));
    if (key_match) {
      return key_match[1];
    }
  }

  return null;
}

function extract_top_level_string(config_text: string, key: string): string | null {
  const lines = config_text.split(/\r?\n/);
  let in_section = false;

  for (const raw_line of lines) {
    const line = raw_line.trim();
    if (!line || line.startsWith('#')) continue;

    if (line.startsWith('[') && line.endsWith(']')) {
      in_section = true;
      continue;
    }

    if (in_section) continue;

    const key_match = line.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"\\s*$`));
    if (key_match) {
      return key_match[1];
    }
  }

  return null;
}

function normalize_reasoning_effort(raw: string | null): string {
  const value = raw?.trim().toLowerCase();
  if (value === 'low' || value === 'medium' || value === 'high') {
    return value;
  }
  return DEFAULT_MODEL_REASONING_EFFORT;
}

function normalize_reasoning_summary(raw: string | null): string {
  const value = raw?.trim().toLowerCase();
  if (value === 'auto' || value === 'concise' || value === 'detailed') {
    return value;
  }
  return DEFAULT_MODEL_REASONING_SUMMARY;
}

function normalize_summary_for_model(model: string, summary: string): string {
  // Mini models currently require detailed summaries in non-interactive turns.
  if (model.includes('mini') && summary !== 'detailed') {
    return DEFAULT_MODEL_REASONING_SUMMARY;
  }
  return summary;
}

function get_profile_reasoning(config: ProjectCodexConfig, profile: string): {
  effort: string;
  summary: string;
} {
  if (profile === CODEX_JAM_PROFILE) {
    return {
      effort: config.jam_agent_reasoning_effort,
      summary: config.jam_agent_reasoning_summary,
    };
  }

  return {
    effort: config.normal_mode_reasoning_effort,
    summary: config.normal_mode_reasoning_summary,
  };
}

export function load_project_codex_config(working_dir: string): ProjectCodexConfig {
  const config_path = resolve_project_codex_config_path(working_dir);
  if (!config_path) {
    throw new CodexRuntimeCheckError(
      'config_missing',
      'Codex runtime unavailable: missing project config. Expected .codex/config.toml ' +
        'or config/codex/config.toml with normal_mode and jam_agent profiles.'
    );
  }

  let config_text = '';
  try {
    config_text = fs.readFileSync(config_path, 'utf-8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CodexRuntimeCheckError(
      'config_missing',
      `Codex runtime unavailable: failed to read config at ${config_path} (${message}).`
    );
  }

  if (!/\[mcp_servers\.strudel\]/.test(config_text)) {
    throw new CodexRuntimeCheckError(
      'config_missing',
      `Codex runtime unavailable: ${config_path} is missing [mcp_servers.strudel].`
    );
  }

  const normal_mode_model = extract_profile_model(config_text, CODEX_NORMAL_PROFILE);
  if (!normal_mode_model) {
    throw new CodexRuntimeCheckError(
      'config_missing',
      `Codex runtime unavailable: ${config_path} is missing [profiles.${CODEX_NORMAL_PROFILE}] model.`
    );
  }

  const jam_agent_model = extract_profile_model(config_text, CODEX_JAM_PROFILE);
  if (!jam_agent_model) {
    throw new CodexRuntimeCheckError(
      'config_missing',
      `Codex runtime unavailable: ${config_path} is missing [profiles.${CODEX_JAM_PROFILE}] model.`
    );
  }

  const top_level_reasoning_effort = extract_top_level_string(config_text, 'model_reasoning_effort');
  const top_level_reasoning_summary = extract_top_level_string(config_text, 'model_reasoning_summary');

  const normal_mode_reasoning_effort = normalize_reasoning_effort(
    extract_profile_string(config_text, CODEX_NORMAL_PROFILE, 'model_reasoning_effort')
    ?? top_level_reasoning_effort
  );
  const jam_agent_reasoning_effort = normalize_reasoning_effort(
    extract_profile_string(config_text, CODEX_JAM_PROFILE, 'model_reasoning_effort')
    ?? top_level_reasoning_effort
  );

  const normal_mode_reasoning_summary = normalize_summary_for_model(
    normal_mode_model,
    normalize_reasoning_summary(
      extract_profile_string(config_text, CODEX_NORMAL_PROFILE, 'model_reasoning_summary')
      ?? top_level_reasoning_summary
    )
  );
  const jam_agent_reasoning_summary = normalize_summary_for_model(
    jam_agent_model,
    normalize_reasoning_summary(
      extract_profile_string(config_text, CODEX_JAM_PROFILE, 'model_reasoning_summary')
      ?? top_level_reasoning_summary
    )
  );

  return {
    config_path,
    normal_mode_model,
    jam_agent_model,
    normal_mode_reasoning_effort,
    jam_agent_reasoning_effort,
    normal_mode_reasoning_summary,
    jam_agent_reasoning_summary,
  };
}

export function build_codex_overrides(
  config: ProjectCodexConfig,
  default_profile: string = CODEX_NORMAL_PROFILE
): string[] {
  const default_reasoning = get_profile_reasoning(config, default_profile);

  return [
    `profiles.${CODEX_NORMAL_PROFILE}.model=${quote_toml_string(config.normal_mode_model)}`,
    `profiles.${CODEX_JAM_PROFILE}.model=${quote_toml_string(config.jam_agent_model)}`,
    `profiles.${CODEX_NORMAL_PROFILE}.model_reasoning_effort=${quote_toml_string(config.normal_mode_reasoning_effort)}`,
    `profiles.${CODEX_JAM_PROFILE}.model_reasoning_effort=${quote_toml_string(config.jam_agent_reasoning_effort)}`,
    `profiles.${CODEX_NORMAL_PROFILE}.model_reasoning_summary=${quote_toml_string(config.normal_mode_reasoning_summary)}`,
    `profiles.${CODEX_JAM_PROFILE}.model_reasoning_summary=${quote_toml_string(config.jam_agent_reasoning_summary)}`,
    `model_reasoning_effort=${quote_toml_string(default_reasoning.effort)}`,
    `model_reasoning_summary=${quote_toml_string(default_reasoning.summary)}`,
    'mcp_servers.strudel.transport="stdio"',
    'mcp_servers.strudel.command="node"',
    'mcp_servers.strudel.args=["packages/mcp-server/build/index.js"]',
    'mcp_servers.strudel.required=false',
    'mcp_servers.playwright.enabled=false',
    'mcp_servers.playwright.required=false',
  ];
}

function with_config_overrides(args: string[], config_overrides: string[]): string[] {
  if (config_overrides.length === 0) return args;

  const flattened: string[] = [];
  for (const override of config_overrides) {
    flattened.push('-c', override);
  }

  return [...flattened, ...args];
}

async function default_run_codex_command(
  args: string[],
  options: { working_dir: string; config_overrides: string[] }
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn('codex', with_config_overrides(args, options.config_overrides), {
      cwd: options.working_dir,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (error: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      resolve({
        exit_code: null,
        stdout,
        stderr,
        error,
      });
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      resolve({
        exit_code: code,
        stdout,
        stderr,
      });
    });
  });
}

async function verify_codex_binary(
  run_command: RunCodexCommand,
  working_dir: string
): Promise<void> {
  const result = await run_command(['--version'], { working_dir, config_overrides: [] });
  if (result.error?.code === 'ENOENT') {
    throw new CodexRuntimeCheckError(
      'binary_missing',
      'Codex runtime unavailable: `codex` binary not found on PATH. Install Codex CLI and retry.'
    );
  }

  if (result.error) {
    throw new CodexRuntimeCheckError(
      'runtime_unavailable',
      `Codex runtime unavailable: failed to start codex binary (${result.error.message}).`
    );
  }

  if (result.exit_code !== 0) {
    throw new CodexRuntimeCheckError(
      'runtime_unavailable',
      `Codex runtime unavailable: 'codex --version' failed (${format_failure_details(result)}).`
    );
  }
}

async function verify_codex_auth(
  run_command: RunCodexCommand,
  working_dir: string,
  config_overrides: string[]
): Promise<void> {
  const result = await run_command(['login', 'status'], { working_dir, config_overrides });
  if (result.exit_code === 0) return;

  throw new CodexRuntimeCheckError(
    'auth_missing',
    'Codex authentication unavailable: run `codex login` (ChatGPT auth) and retry. ' +
      `Details: ${format_failure_details(result)}`
  );
}

async function verify_profiles_resolvable(
  run_command: RunCodexCommand,
  working_dir: string,
  config: ProjectCodexConfig,
  config_overrides: string[],
  profiles: string[]
): Promise<void> {
  for (const profile of profiles) {
    const probe_path = profile_probe_schema_path(config, profile);
    const result = await run_command(
      [
        'exec',
        '-p',
        profile,
        '--json',
        '--skip-git-repo-check',
        '--output-schema',
        probe_path,
        'profile resolution probe',
      ],
      { working_dir, config_overrides }
    );

    const details = format_failure_details(result);

    if (profile_not_found(details, profile)) {
      throw new CodexRuntimeCheckError(
        'profile_missing',
        `Codex profile missing: profile \`${profile}\` is not resolvable. ` +
          'Ensure project config defines the profile and runtime overrides are valid.'
      );
    }

    if (profile_probe_passed(details, probe_path)) {
      continue;
    }

    throw new CodexRuntimeCheckError(
      'runtime_unavailable',
      `Codex profile check failed for \`${profile}\`: ${details}`
    );
  }
}

function parse_mcp_list_output(stdout: string): Array<{ name?: string }> {
  const trimmed = stdout.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed as Array<{ name?: string }> : [];
  } catch {
    const start = trimmed.indexOf('[');
    const end = trimmed.lastIndexOf(']');
    if (start < 0 || end <= start) {
      throw new Error(`Unable to parse codex mcp list output: ${trimmed}`);
    }
    const sliced = trimmed.slice(start, end + 1);
    const parsed = JSON.parse(sliced);
    return Array.isArray(parsed) ? parsed as Array<{ name?: string }> : [];
  }
}

async function verify_required_mcp_servers(
  run_command: RunCodexCommand,
  working_dir: string,
  config_overrides: string[],
  required_servers: string[]
): Promise<void> {
  const result = await run_command(['mcp', 'list', '--json'], { working_dir, config_overrides });
  if (result.exit_code !== 0) {
    throw new CodexRuntimeCheckError(
      'runtime_unavailable',
      `Codex MCP inspection failed: ${format_failure_details(result)}`
    );
  }

  let servers: Array<{ name?: string }> = [];
  try {
    servers = parse_mcp_list_output(result.stdout);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CodexRuntimeCheckError(
      'runtime_unavailable',
      `Codex MCP inspection failed: ${message}`
    );
  }

  const server_names = new Set(servers.map((server) => server.name).filter(Boolean));
  const missing = required_servers.filter((name) => !server_names.has(name));
  if (missing.length === 0) return;

  throw new CodexRuntimeCheckError(
    'mcp_missing',
    `Codex MCP server unavailable for normal mode: missing ${missing.join(', ')}. ` +
      'Confirm project Codex config is present and Strudel MCP registration is valid.'
  );
}

export async function assert_codex_runtime_ready(
  options: CodexRuntimeCheckOptions
): Promise<void> {
  const key = cache_key(options);
  const last_success_at = success_cache.get(key);
  if (!options.force && last_success_at && Date.now() - last_success_at < SUCCESS_CACHE_TTL_MS) {
    return;
  }

  const run_command = options.run_command ?? default_run_codex_command;
  const profiles = options.required_profiles ?? [...REQUIRED_PROFILES];
  const required_mcp_servers = options.required_mcp_servers ?? [...REQUIRED_MCP_SERVERS];
  const config = load_project_codex_config(options.working_dir);
  const config_overrides = build_codex_overrides(config);

  await verify_codex_binary(run_command, options.working_dir);
  await verify_codex_auth(run_command, options.working_dir, config_overrides);
  await verify_profiles_resolvable(
    run_command,
    options.working_dir,
    config,
    config_overrides,
    profiles
  );
  await verify_required_mcp_servers(
    run_command,
    options.working_dir,
    config_overrides,
    required_mcp_servers
  );

  success_cache.set(key, Date.now());
}

export function clear_codex_runtime_check_cache(): void {
  success_cache.clear();
}
