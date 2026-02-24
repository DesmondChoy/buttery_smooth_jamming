import { PassThrough } from 'stream';
import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const runtime_check_mocks = vi.hoisted(() => ({
  assert_codex_runtime_ready: vi.fn(),
  load_project_codex_config: vi.fn(),
  build_codex_overrides: vi.fn(),
}));

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('../codex-runtime-checks', () => ({
  CODEX_NORMAL_PROFILE: 'normal_mode',
  assert_codex_runtime_ready: runtime_check_mocks.assert_codex_runtime_ready,
  load_project_codex_config: runtime_check_mocks.load_project_codex_config,
  build_codex_overrides: runtime_check_mocks.build_codex_overrides,
}));

import { spawn } from 'child_process';
import { CodexProcess } from '../codex-process';

const mocked_spawn = vi.mocked(spawn);

function create_fake_process() {
  const proc = new EventEmitter() as EventEmitter & {
    stdin: PassThrough;
    stdout: PassThrough;
    stderr: PassThrough;
    killed: boolean;
    exitCode: number | null;
    kill: (signal?: string) => boolean;
    pid: number;
  };

  proc.stdin = new PassThrough();
  proc.stdout = new PassThrough();
  proc.stderr = new PassThrough();
  proc.killed = false;
  proc.exitCode = null;
  proc.pid = 12345;
  proc.kill = vi.fn((signal?: string) => {
    proc.killed = true;
    proc.exitCode = 0;
    proc.emit('exit', 0, signal || null);
    return true;
  });

  return proc;
}

describe('CodexProcess startup checks + profile args', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    runtime_check_mocks.assert_codex_runtime_ready.mockResolvedValue(undefined);
    runtime_check_mocks.load_project_codex_config.mockReturnValue({
      config_path: '/repo/config/codex/config.toml',
      normal_mode_model: 'gpt-5-codex',
      jam_agent_model: 'gpt-5-codex-mini',
    });
    runtime_check_mocks.build_codex_overrides.mockReturnValue([
      'profiles.normal_mode.model="gpt-5-codex"',
      'profiles.jam_agent.model="gpt-5-codex-mini"',
      'mcp_servers.strudel.command="node"',
      'mcp_servers.strudel.args=["packages/mcp-server/build/index.js"]',
      'mcp_servers.strudel.required=false',
      'mcp_servers.playwright.enabled=false',
      'mcp_servers.playwright.required=false',
    ]);
  });

  afterEach(async () => {
    vi.useRealTimers();
  });

  it('runs runtime availability checks during start', async () => {
    const proc = new CodexProcess({ workingDir: '/repo' });

    await proc.start();

    expect(runtime_check_mocks.assert_codex_runtime_ready).toHaveBeenCalledWith({
      working_dir: '/repo',
    });

    await proc.stop();
  });

  it('spawns codex exec with normal_mode profile and project overrides', async () => {
    const fake_child = create_fake_process();
    mocked_spawn.mockReturnValue(fake_child as unknown as ReturnType<typeof spawn>);

    const proc = new CodexProcess({
      workingDir: '/repo',
      wsUrl: 'ws://localhost:4123/api/ws',
    });

    await proc.start();
    proc.send('make a beat');

    expect(mocked_spawn).toHaveBeenCalledTimes(1);
    const call = mocked_spawn.mock.calls[0];
    const command = call[0];
    const args = call[1] as string[];
    const options = call[2] as { env?: NodeJS.ProcessEnv };

    expect(command).toBe('codex');
    expect(args).toContain('--profile');
    expect(args).toContain('normal_mode');
    expect(args).toContain('profiles.normal_mode.model="gpt-5-codex"');
    expect(args).toContain(`mcp_servers.strudel.env.WS_URL="ws://localhost:4123/api/ws"`);
    expect(options.env?.CODEX_HOME).toBeUndefined();

    fake_child.emit('exit', 0, null);
    await proc.stop();
  });
});
