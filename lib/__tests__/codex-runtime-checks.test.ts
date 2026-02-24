import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assert_codex_runtime_ready,
  clear_codex_runtime_check_cache,
  CodexRuntimeCheckError,
} from '../codex-runtime-checks';

const CONFIG_BODY = `
[profiles.normal_mode]
model = "gpt-5-codex"

[profiles.jam_agent]
model = "gpt-5-codex-mini"

[mcp_servers.strudel]
command = "node"
args = ["packages/mcp-server/build/index.js"]
required = false
`;

function create_temp_repo(with_config = true): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-runtime-checks-'));
  if (with_config) {
    const config_dir = path.join(root, 'config', 'codex');
    fs.mkdirSync(config_dir, { recursive: true });
    fs.writeFileSync(path.join(config_dir, 'config.toml'), CONFIG_BODY, 'utf-8');
  }
  return root;
}

function create_success_runner() {
  return vi.fn(async (args: string[]) => {
    if (args[0] === '--version') {
      return { exit_code: 0, stdout: 'codex 0.104.0', stderr: '' };
    }

    if (args[0] === 'login' && args[1] === 'status') {
      return { exit_code: 0, stdout: 'Logged in using ChatGPT', stderr: '' };
    }

    if (args[0] === 'exec') {
      const schema_index = args.findIndex((value) => value === '--output-schema');
      const schema_path = schema_index >= 0 ? args[schema_index + 1] : '/tmp/missing.schema.json';
      return {
        exit_code: 1,
        stdout: '',
        stderr: `Failed to read output schema file ${schema_path}: No such file or directory (os error 2)`,
      };
    }

    if (args[0] === 'mcp' && args[1] === 'list') {
      return {
        exit_code: 0,
        stdout: JSON.stringify([{ name: 'strudel' }]),
        stderr: '',
      };
    }

    return { exit_code: 0, stdout: '', stderr: '' };
  });
}

describe('assert_codex_runtime_ready', () => {
  beforeEach(() => {
    clear_codex_runtime_check_cache();
  });

  afterEach(() => {
    clear_codex_runtime_check_cache();
  });

  it('fails clearly when config is missing', async () => {
    const working_dir = create_temp_repo(false);

    await expect(assert_codex_runtime_ready({ working_dir })).rejects.toMatchObject({
      name: 'CodexRuntimeCheckError',
      code: 'config_missing',
    });

    fs.rmSync(working_dir, { recursive: true, force: true });
  });

  it('fails clearly when codex binary is missing', async () => {
    const working_dir = create_temp_repo(true);
    const run_command = vi.fn(async () => ({
      exit_code: null,
      stdout: '',
      stderr: '',
      error: Object.assign(new Error('spawn codex ENOENT'), { code: 'ENOENT' }),
    }));

    await expect(assert_codex_runtime_ready({ working_dir, run_command })).rejects.toMatchObject({
      name: 'CodexRuntimeCheckError',
      code: 'binary_missing',
    });

    fs.rmSync(working_dir, { recursive: true, force: true });
  });

  it('fails clearly when authentication is missing', async () => {
    const working_dir = create_temp_repo(true);
    const run_command = vi.fn(async (args: string[]) => {
      if (args[0] === '--version') return { exit_code: 0, stdout: 'codex 0.104.0', stderr: '' };
      if (args[0] === 'login') return { exit_code: 1, stdout: '', stderr: 'Not logged in' };
      return { exit_code: 0, stdout: '', stderr: '' };
    });

    await expect(assert_codex_runtime_ready({ working_dir, run_command })).rejects.toMatchObject({
      name: 'CodexRuntimeCheckError',
      code: 'auth_missing',
    });

    fs.rmSync(working_dir, { recursive: true, force: true });
  });

  it('fails clearly when a required profile is missing', async () => {
    const working_dir = create_temp_repo(true);
    const run_command = vi.fn(async (args: string[]) => {
      if (args[0] === '--version') return { exit_code: 0, stdout: 'codex 0.104.0', stderr: '' };
      if (args[0] === 'login') return { exit_code: 0, stdout: 'Logged in using ChatGPT', stderr: '' };
      if (args[0] === 'exec') {
        const profile = args[args.findIndex((value) => value === '-p') + 1];
        if (profile === 'jam_agent') {
          return {
            exit_code: 1,
            stdout: '',
            stderr: 'Error: config profile `jam_agent` not found',
          };
        }

        const schema_path = args[args.findIndex((value) => value === '--output-schema') + 1];
        return {
          exit_code: 1,
          stdout: '',
          stderr: `Failed to read output schema file ${schema_path}: No such file or directory (os error 2)`,
        };
      }
      if (args[0] === 'mcp') {
        return { exit_code: 0, stdout: JSON.stringify([{ name: 'strudel' }]), stderr: '' };
      }
      return { exit_code: 0, stdout: '', stderr: '' };
    });

    await expect(assert_codex_runtime_ready({ working_dir, run_command })).rejects.toMatchObject({
      name: 'CodexRuntimeCheckError',
      code: 'profile_missing',
    });

    fs.rmSync(working_dir, { recursive: true, force: true });
  });

  it('fails clearly when required MCP servers are missing', async () => {
    const working_dir = create_temp_repo(true);
    const run_command = vi.fn(async (args: string[]) => {
      if (args[0] === '--version') return { exit_code: 0, stdout: 'codex 0.104.0', stderr: '' };
      if (args[0] === 'login') return { exit_code: 0, stdout: 'Logged in using ChatGPT', stderr: '' };
      if (args[0] === 'exec') {
        const schema_path = args[args.findIndex((value) => value === '--output-schema') + 1];
        return {
          exit_code: 1,
          stdout: '',
          stderr: `Failed to read output schema file ${schema_path}: No such file or directory (os error 2)`,
        };
      }
      if (args[0] === 'mcp') {
        return { exit_code: 0, stdout: JSON.stringify([{ name: 'playwright' }]), stderr: '' };
      }
      return { exit_code: 0, stdout: '', stderr: '' };
    });

    await expect(assert_codex_runtime_ready({ working_dir, run_command })).rejects.toMatchObject({
      name: 'CodexRuntimeCheckError',
      code: 'mcp_missing',
    });

    fs.rmSync(working_dir, { recursive: true, force: true });
  });

  it('caches successful checks', async () => {
    const working_dir = create_temp_repo(true);
    const run_command = create_success_runner();

    await assert_codex_runtime_ready({ working_dir, run_command });
    const first_call_count = run_command.mock.calls.length;

    await assert_codex_runtime_ready({ working_dir, run_command });
    expect(run_command.mock.calls.length).toBe(first_call_count);

    const override_calls = run_command.mock.calls
      .map(([_args, opts]) => opts.config_overrides as string[])
      .filter((overrides) => overrides.length > 0);

    expect(override_calls.length).toBeGreaterThan(0);
    expect(
      override_calls.some((overrides) =>
        overrides.some((entry) => entry.startsWith('profiles.normal_mode.model='))
      )
    ).toBe(true);

    fs.rmSync(working_dir, { recursive: true, force: true });
  });

  it('exposes typed error class for callers', () => {
    const err = new CodexRuntimeCheckError('runtime_unavailable', 'boom');
    expect(err.name).toBe('CodexRuntimeCheckError');
    expect(err.code).toBe('runtime_unavailable');
  });
});
