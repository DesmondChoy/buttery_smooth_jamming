import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PassThrough } from 'stream';
import { EventEmitter } from 'events';

const runtime_check_mocks = vi.hoisted(() => ({
  assert_codex_runtime_ready: vi.fn(),
  load_project_codex_config: vi.fn(),
  build_codex_overrides: vi.fn(),
}));

// ─── Mocks ──────────────────────────────────────────────────────────
// Mock child_process.spawn to return controllable fake processes
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('../codex-runtime-checks', () => ({
  CODEX_JAM_PROFILE: 'jam_agent',
  assert_codex_runtime_ready: runtime_check_mocks.assert_codex_runtime_ready,
  load_project_codex_config: runtime_check_mocks.load_project_codex_config,
  build_codex_overrides: runtime_check_mocks.build_codex_overrides,
}));

// Pin randomMusicalContext to the old C minor defaults so existing assertions stay stable
vi.mock('../musical-context-presets', () => ({
  randomMusicalContext: () => ({
    genre: 'Dark Ambient',
    key: 'C minor',
    scale: ['C', 'D', 'Eb', 'F', 'G', 'Ab', 'Bb'],
    chordProgression: ['Cm', 'Ab', 'Eb', 'Bb'],
    bpm: 120,
    timeSignature: '4/4',
    energy: 5,
  }),
}));

// Mock fs.readFileSync to return fake agent files + strudel reference
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn((filePath: fs.PathLike) => {
      const resolvedPath = String(filePath);
      return (
        resolvedPath.includes('strudel-reference.md')
        || resolvedPath.includes('.codex/agents')
      );
    }),
    readFileSync: vi.fn((filePath: string) => {
      if (filePath.includes('strudel-reference.md')) return '# Strudel Ref';
      // Return a fake agent .md with YAML frontmatter
      return '---\nmodel: legacy-test-model\n---\nYou are a test agent.';
    }),
  };
});

import { spawn } from 'child_process';
import * as fs from 'fs';
import { AgentProcessManager, BroadcastFn } from '../agent-process-manager';
import type { MusicalContext } from '../types';

const mockedSpawn = vi.mocked(spawn);

const default_exists_sync_impl = (filePath: fs.PathLike) => {
  const resolvedPath = String(filePath);
  return (
    resolvedPath.includes('strudel-reference.md')
    || resolvedPath.includes('.codex/agents')
  );
};

function setupRuntimeCheckMocks() {
  runtime_check_mocks.assert_codex_runtime_ready.mockResolvedValue(undefined);
  runtime_check_mocks.load_project_codex_config.mockReturnValue({
    config_path: '/fake/dir/config/codex/config.toml',
    normal_mode_model: 'gpt-5-codex',
    jam_agent_model: 'gpt-5-codex-mini',
    normal_mode_reasoning_effort: 'low',
    jam_agent_reasoning_effort: 'low',
    normal_mode_reasoning_summary: 'detailed',
    jam_agent_reasoning_summary: 'detailed',
  });
  runtime_check_mocks.build_codex_overrides.mockReturnValue([
    'profiles.normal_mode.model="gpt-5-codex"',
    'profiles.jam_agent.model="gpt-5-codex-mini"',
    'profiles.normal_mode.model_reasoning_effort="low"',
    'profiles.jam_agent.model_reasoning_effort="low"',
    'profiles.normal_mode.model_reasoning_summary="detailed"',
    'profiles.jam_agent.model_reasoning_summary="detailed"',
    'model_reasoning_effort="low"',
    'model_reasoning_summary="detailed"',
    'mcp_servers.strudel.transport="stdio"',
    'mcp_servers.strudel.command="node"',
    'mcp_servers.strudel.args=["packages/mcp-server/build/index.js"]',
    'mcp_servers.strudel.required=false',
    'mcp_servers.playwright.enabled=false',
    'mcp_servers.playwright.required=false',
  ]);
}

// ─── Helpers ────────────────────────────────────────────────────────

/** Create a fake ChildProcess with controllable stdin/stdout/stderr. */
function createFakeProcess() {
  const stdin = new PassThrough() as PassThrough & {
    end: (...args: unknown[]) => PassThrough;
  };
  // Codex turns are separate processes in production; tests may reuse one fake
  // process per agent key, so keep stdin writable across turns.
  stdin.end = vi.fn(() => stdin);
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const proc = new EventEmitter() as EventEmitter & {
    stdin: PassThrough;
    stdout: PassThrough;
    stderr: PassThrough;
    pid: number;
    killed: boolean;
    kill: (signal?: string) => boolean;
  };
  proc.stdin = stdin;
  proc.stdout = stdout;
  proc.stderr = stderr;
  proc.pid = Math.floor(Math.random() * 10000);
  proc.killed = false;
  proc.kill = vi.fn((signal?: string) => {
    proc.killed = true;
    proc.emit('exit', 0, signal || 'SIGTERM');
    return true;
  });
  return proc;
}

/** Send a stream-json response line from a fake agent process. */
function sendAgentResponse(
  proc: ReturnType<typeof createFakeProcess>,
  response: {
    pattern: string;
    thoughts: string;
    reaction: string;
    decision?: {
      tempo_delta_pct?: unknown;
      energy_delta?: unknown;
      arrangement_intent?: unknown;
      confidence?: unknown;
      suggested_key?: unknown;
      suggested_chords?: unknown;
    };
  }
) {
  // Send assistant message with the JSON response
  const assistantMsg = {
    type: 'assistant',
    message: {
      content: [{ type: 'text', text: JSON.stringify(response) }],
    },
  };
  proc.stdout.write(JSON.stringify(assistantMsg) + '\n');

  // Send result message to signal turn completion
  const resultMsg = { type: 'result', result: 'ok' };
  proc.stdout.write(JSON.stringify(resultMsg) + '\n');
}

function sendThreadStarted(proc: ReturnType<typeof createFakeProcess>, threadId: string) {
  proc.stdout.write(
    JSON.stringify({ type: 'thread.started', thread_id: threadId }) + '\n'
  );
}

function sendRawAgentText(proc: ReturnType<typeof createFakeProcess>, rawText: string) {
  const assistantMsg = {
    type: 'assistant',
    message: {
      content: [{ type: 'text', text: rawText }],
    },
  };
  proc.stdout.write(JSON.stringify(assistantMsg) + '\n');
  proc.stdout.write(JSON.stringify({ type: 'result', result: 'ok' }) + '\n');
}

/** Create a manager with mocked spawn, returns the manager + fake processes. */
function createTestManager(): {
  manager: AgentProcessManager;
  broadcast: ReturnType<typeof vi.fn>;
  processes: Map<string, ReturnType<typeof createFakeProcess>>;
} {
  const processes = new Map<string, ReturnType<typeof createFakeProcess>>();
  const broadcast = vi.fn() as ReturnType<typeof vi.fn> & BroadcastFn;

  mockedSpawn.mockImplementation((_cmd, _args, options) => {
    const env = (options as { env?: NodeJS.ProcessEnv } | undefined)?.env;
    const key = env?.JAM_AGENT_KEY || `proc_${processes.size}`;
    let proc = processes.get(key);
    if (!proc) {
      proc = createFakeProcess();
      processes.set(key, proc);
    }
    return proc as unknown as ReturnType<typeof spawn>;
  });

  const manager = new AgentProcessManager({
    workingDir: '/fake/dir',
    broadcast,
  });

  return { manager, broadcast, processes };
}

/** Get the Nth process from the processes map (0-indexed). */
function getNthProcess(
  processes: Map<string, ReturnType<typeof createFakeProcess>>,
  n: number
) {
  return Array.from(processes.values())[n];
}

function getProcessByKey(
  processes: Map<string, ReturnType<typeof createFakeProcess>>,
  key: string
) {
  const proc = processes.get(key);
  if (!proc) {
    throw new Error(`Missing fake process for key: ${key}`);
  }
  return proc;
}

interface BroadcastJamState {
  currentRound: number;
  musicalContext: MusicalContext;
  agents: Record<string, unknown>;
  activeAgents: string[];
}

function getJamStateForRound(
  broadcast: ReturnType<typeof vi.fn>,
  round: number
): BroadcastJamState | undefined {
  return broadcast.mock.calls
    .map(([msg]: unknown[]) => msg as { type: string; payload?: { jamState?: BroadcastJamState } })
    .filter((msg) => msg.type === 'jam_state_update' && !!msg.payload?.jamState)
    .map((msg) => msg.payload!.jamState!)
    .find((jamState) => jamState.currentRound === round);
}

function getLatestJamState(
  broadcast: ReturnType<typeof vi.fn>
): BroadcastJamState | undefined {
  const jamStates = broadcast.mock.calls
    .map(([msg]: unknown[]) => msg as { type: string; payload?: { jamState?: BroadcastJamState } })
    .filter((msg) => msg.type === 'jam_state_update' && !!msg.payload?.jamState)
    .map((msg) => msg.payload!.jamState!);

  return jamStates[jamStates.length - 1];
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('AgentProcessManager turn serialization', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockImplementation(default_exists_sync_impl);
    setupRuntimeCheckMocks();
  });

  afterEach(async () => {
    vi.useRealTimers();
  });

  it('directive waits for in-flight tick before executing', async () => {
    const { manager, broadcast, processes } = createTestManager();

    // Start with one agent (drums)
    const startPromise = manager.start(['drums']);

    // Wait for spawn to be called
    await vi.advanceTimersByTimeAsync(0);

    const drumsProc = getNthProcess(processes, 0);

    // Respond to jam-start
    sendAgentResponse(drumsProc, {
      pattern: 's("bd sd")',
      thoughts: 'Opening beat',
      reaction: 'Let\'s go!',
    });

    await startPromise;

    // Trigger an auto-tick by advancing the timer
    vi.advanceTimersByTime(30000);
    // Flush microtasks so the tick turn starts and attaches its readline listener
    await vi.advanceTimersByTimeAsync(0);

    // Queue a directive BEHIND the in-flight tick
    const directivePromise = manager.handleDirective(
      'More cowbell!',
      'drums',
      ['drums']
    );

    // Respond to the tick (listener is attached, so readline fires)
    sendAgentResponse(drumsProc, {
      pattern: 's("bd sd bd sd")',
      thoughts: 'Evolving',
      reaction: 'Grooving',
    });

    // Flush microtasks: tick completes, directive turn starts
    await vi.advanceTimersByTimeAsync(0);

    // Respond to the directive
    sendAgentResponse(drumsProc, {
      pattern: 's("bd sd cp sd")',
      thoughts: 'Added cowbell',
      reaction: 'More cowbell!',
    });

    await directivePromise;

    // Verify the turns executed sequentially by checking broadcast calls.
    // The jam_state_update payloads should show incrementing round numbers:
    // jam-start = round 1, tick = round 2, directive = round 3
    const jamStateUpdates = broadcast.mock.calls
      .filter(([msg]: unknown[]) => (msg as { type: string }).type === 'jam_state_update')
      .map(([msg]: unknown[]) => (msg as { payload: { jamState: { currentRound: number } } }).payload.jamState.currentRound);

    expect(jamStateUpdates).toEqual([1, 2, 3]);
  });

  it('loads personas from .codex/agents when available', async () => {
    const mockedExistsSync = vi.mocked(fs.existsSync);
    const mockedReadFileSync = vi.mocked(fs.readFileSync);

    mockedExistsSync.mockImplementation((filePath: fs.PathLike) => {
      const resolvedPath = String(filePath);
      return (
        resolvedPath.includes('strudel-reference.md')
        || resolvedPath.includes('.codex/agents')
      );
    });

    const { manager, processes } = createTestManager();
    const startPromise = manager.start(['drums']);
    await vi.advanceTimersByTimeAsync(0);

    const drumsProc = getNthProcess(processes, 0);
    sendAgentResponse(drumsProc, {
      pattern: 's("bd sd")',
      thoughts: 'Opening beat',
      reaction: 'Ready',
    });

    await startPromise;

    expect(mockedReadFileSync).toHaveBeenCalledWith(
      expect.stringContaining('/.codex/agents/drummer.md'),
      'utf-8'
    );
  });

  it('assembles persona + shared policy + strudel reference deterministically', () => {
    const { manager } = createTestManager();
    const rawManager = manager as unknown as {
      buildAgentSystemPrompt: (agentKey: string) => { prompt: string; model: string } | null;
    };

    const first = rawManager.buildAgentSystemPrompt('drums');
    const second = rawManager.buildAgentSystemPrompt('drums');

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first!.model).toBe('gpt-5-codex-mini');
    expect(first!.prompt).toContain('<agent_persona>');
    expect(first!.prompt).toContain('You are a test agent.');
    expect(first!.prompt).toContain('<shared_policy>');
    expect(first!.prompt).toContain('<jam_musical_policy>');
    expect(first!.prompt).toContain('<strudel_validity_policy>');
    expect(first!.prompt).toContain('<strudel_reference>\n# Strudel Ref\n</strudel_reference>');

    const personaIndex = first!.prompt.indexOf('<agent_persona>');
    const policyIndex = first!.prompt.indexOf('<shared_policy>');
    const strudelIndex = first!.prompt.indexOf('<strudel_reference>');
    expect(personaIndex).toBeGreaterThanOrEqual(0);
    expect(policyIndex).toBeGreaterThan(personaIndex);
    expect(strudelIndex).toBeGreaterThan(policyIndex);
    expect(second!.prompt).toBe(first!.prompt);
  });

  it('enforces hard-toolless codex args for jam turns and resumes', async () => {
    const { manager, processes } = createTestManager();

    const startPromise = manager.start(['drums']);
    await vi.advanceTimersByTimeAsync(0);

    const drumsProc = getNthProcess(processes, 0);
    sendThreadStarted(drumsProc, 'thread-drums-1');
    sendAgentResponse(drumsProc, {
      pattern: 's("bd sd")',
      thoughts: 'Opening beat',
      reaction: 'Ready',
    });
    await startPromise;

    const directivePromise = manager.handleDirective(
      'hold pocket',
      'drums',
      ['drums']
    );
    await vi.advanceTimersByTimeAsync(0);

    sendAgentResponse(drumsProc, {
      pattern: 'no_change',
      thoughts: 'Pocket is locked',
      reaction: 'Holding',
    });
    await directivePromise;

    const jamTurnCalls = mockedSpawn.mock.calls.slice(0, 2);
    expect(jamTurnCalls).toHaveLength(2);

    for (const call of jamTurnCalls) {
      const args = call[1] as string[];
      const toolsIndex = args.indexOf('--tools');
      expect(toolsIndex).toBeGreaterThanOrEqual(0);
      expect(args[toolsIndex + 1]).toBe('');
      expect(args).toContain('--strict-mcp-config');
    }

    const initialArgs = jamTurnCalls[0][1] as string[];
    expect(initialArgs).toEqual(expect.arrayContaining(['--profile', 'jam_agent']));

    const resumeArgs = jamTurnCalls[1][1] as string[];
    expect(resumeArgs[0]).toBe('exec');
    expect(resumeArgs[1]).toBe('resume');

    await manager.stop();
  });

  it('skips spawning when a .codex persona file is missing', async () => {
    const mockedExistsSync = vi.mocked(fs.existsSync);
    mockedExistsSync.mockImplementation((filePath: fs.PathLike) => {
      const resolvedPath = String(filePath);
      if (resolvedPath.includes('strudel-reference.md')) return true;
      return false;
    });

    const { manager, processes, broadcast } = createTestManager();
    await manager.start(['drums']);

    expect(processes.size).toBe(0);

    const statusEvents = broadcast.mock.calls
      .map(([msg]: unknown[]) => msg as { type: string; payload?: { status?: string } })
      .filter((msg) => msg.type === 'agent_status');

    expect(statusEvents).toHaveLength(1);
    expect(statusEvents[0].payload?.status).toBe('timeout');
  });

  it('rejects invalid agent response schema and falls back safely', async () => {
    const { manager, processes } = createTestManager();

    const startPromise = manager.start(['drums']);
    await vi.advanceTimersByTimeAsync(0);

    const drumsProc = getNthProcess(processes, 0);
    sendRawAgentText(drumsProc, '{"pattern":"s(\\"bd sd\\")","thoughts":"Missing reaction"}');
    await startPromise;

    const snapshot = manager.getJamStateSnapshot();
    expect(snapshot.agents.drums?.status).toBe('timeout');
    expect(snapshot.agents.drums?.reaction).toContain('timed out');

    await manager.stop();
  });

  it('accepts legacy payload without decision block', async () => {
    const { manager, processes } = createTestManager();
    const rawManager = manager as unknown as {
      agentDecisions: Record<string, unknown>;
    };

    const startPromise = manager.start(['drums']);
    await vi.advanceTimersByTimeAsync(0);

    const drumsProc = getNthProcess(processes, 0);
    sendAgentResponse(drumsProc, {
      pattern: 's("bd sd")',
      thoughts: 'Opening beat',
      reaction: 'Ready',
    });
    await startPromise;

    const snapshot = manager.getJamStateSnapshot();
    expect(snapshot.agents.drums?.status).toBe('playing');
    expect(snapshot.agents.drums?.pattern).toBe('s("bd sd")');
    expect(rawManager.agentDecisions.drums).toBeUndefined();

    await manager.stop();
  });

  it('accepts and stores normalized structured decision block', async () => {
    const { manager, processes } = createTestManager();
    const rawManager = manager as unknown as {
      agentDecisions: Record<string, unknown>;
    };

    const startPromise = manager.start(['drums']);
    await vi.advanceTimersByTimeAsync(0);

    const drumsProc = getNthProcess(processes, 0);
    sendRawAgentText(
      drumsProc,
      JSON.stringify({
        pattern: 's("bd sd")',
        thoughts: 'Pushing forward',
        reaction: 'Leaning in',
        decision: {
          tempo_delta_pct: 72.4,
          energy_delta: -4.8,
          arrangement_intent: 'Strip Back',
          confidence: 'HIGH',
          suggested_key: 'EB major',
        },
      })
    );
    await startPromise;

    expect(rawManager.agentDecisions.drums).toEqual({
      tempo_delta_pct: 50,
      energy_delta: -3,
      arrangement_intent: 'strip_back',
      confidence: 'high',
      suggested_key: 'Eb major',
    });

    await manager.stop();
  });

  it('handles partial decision block safely', async () => {
    const { manager, processes } = createTestManager();
    const rawManager = manager as unknown as {
      agentDecisions: Record<string, unknown>;
    };

    const startPromise = manager.start(['drums']);
    await vi.advanceTimersByTimeAsync(0);

    const drumsProc = getNthProcess(processes, 0);
    sendRawAgentText(
      drumsProc,
      JSON.stringify({
        pattern: 's("bd sd cp sd")',
        thoughts: 'Slightly more pressure',
        reaction: 'Still steady',
        decision: {
          energy_delta: 1.8,
        },
      })
    );
    await startPromise;

    expect(rawManager.agentDecisions.drums).toEqual({
      energy_delta: 2,
    });

    const snapshot = manager.getJamStateSnapshot();
    expect(snapshot.agents.drums?.status).toBe('playing');

    await manager.stop();
  });

  it('tolerates invalid decision block without rejecting valid required fields', async () => {
    const { manager, processes } = createTestManager();
    const rawManager = manager as unknown as {
      agentDecisions: Record<string, unknown>;
    };

    const startPromise = manager.start(['drums']);
    await vi.advanceTimersByTimeAsync(0);

    const drumsProc = getNthProcess(processes, 0);
    sendRawAgentText(
      drumsProc,
      JSON.stringify({
        pattern: 's("bd sd")',
        thoughts: 'Holding pocket',
        reaction: 'Locked',
        decision: {
          tempo_delta_pct: 'faster',
          energy_delta: null,
          arrangement_intent: { mode: 'build' },
          confidence: 'certainly',
        },
      })
    );
    await startPromise;

    const snapshot = manager.getJamStateSnapshot();
    expect(snapshot.agents.drums?.status).toBe('playing');
    expect(snapshot.agents.drums?.reaction).toBe('Locked');
    expect(rawManager.agentDecisions.drums).toBeUndefined();

    await manager.stop();
  });

  it('still rejects invalid top-level required schema even when decision block exists', async () => {
    const { manager, processes } = createTestManager();
    const rawManager = manager as unknown as {
      agentDecisions: Record<string, unknown>;
    };

    const startPromise = manager.start(['drums']);
    await vi.advanceTimersByTimeAsync(0);

    const drumsProc = getNthProcess(processes, 0);
    sendRawAgentText(
      drumsProc,
      JSON.stringify({
        pattern: 's("bd sd")',
        thoughts: 'Missing reaction should fail',
        decision: {
          tempo_delta_pct: 10,
          energy_delta: 1,
          arrangement_intent: 'build',
          confidence: 'medium',
        },
      })
    );
    await startPromise;

    const snapshot = manager.getJamStateSnapshot();
    expect(snapshot.agents.drums?.status).toBe('timeout');
    expect(snapshot.agents.drums?.reaction).toContain('timed out');
    expect(rawManager.agentDecisions.drums).toBeUndefined();

    await manager.stop();
  });

  it('two simultaneous directives serialize correctly', async () => {
    const { manager, broadcast, processes } = createTestManager();

    // Start with one agent
    const startPromise = manager.start(['drums']);
    await vi.advanceTimersByTimeAsync(0);

    const drumsProc = getNthProcess(processes, 0);

    // Respond to jam-start
    sendAgentResponse(drumsProc, {
      pattern: 's("bd sd")',
      thoughts: 'Opening',
      reaction: 'Go!',
    });
    await startPromise;

    // Send two directives concurrently
    const d1 = manager.handleDirective('Faster!', 'drums', ['drums']);
    const d2 = manager.handleDirective('Louder!', 'drums', ['drums']);

    // First directive gets the agent — respond to it
    await vi.advanceTimersByTimeAsync(0);
    sendAgentResponse(drumsProc, {
      pattern: 's("bd sd bd sd").fast(2)',
      thoughts: 'Going faster',
      reaction: 'Speed!',
    });

    // Allow first directive to complete and second to start
    await vi.advanceTimersByTimeAsync(0);

    // Second directive now gets the agent — respond
    sendAgentResponse(drumsProc, {
      pattern: 's("bd sd bd sd").fast(2).gain(1.2)',
      thoughts: 'Going louder',
      reaction: 'Volume!',
    });

    await Promise.all([d1, d2]);

    // Both directives should have incremented the round:
    // jam-start = round 1, d1 = round 2, d2 = round 3
    const jamStateUpdates = broadcast.mock.calls
      .filter(([msg]: unknown[]) => (msg as { type: string }).type === 'jam_state_update')
      .map(([msg]: unknown[]) => (msg as { payload: { jamState: { currentRound: number } } }).payload.jamState.currentRound);

    expect(jamStateUpdates).toEqual([1, 2, 3]);
  });

  it('no duplicate readline listeners per agent', async () => {
    const { manager, broadcast, processes } = createTestManager();

    const startPromise = manager.start(['drums']);
    await vi.advanceTimersByTimeAsync(0);

    const drumsProc = getNthProcess(processes, 0);

    // Respond to jam-start
    sendAgentResponse(drumsProc, {
      pattern: 's("bd")',
      thoughts: 'Test',
      reaction: 'Test',
    });
    await startPromise;

    // Trigger tick, flush microtasks so listener attaches
    vi.advanceTimersByTime(30000);
    await vi.advanceTimersByTimeAsync(0);

    // Queue directive behind the in-flight tick
    const directivePromise = manager.handleDirective('Test', 'drums', ['drums']);

    // Respond to tick
    sendAgentResponse(drumsProc, {
      pattern: 's("bd sd")',
      thoughts: 'Tick',
      reaction: 'Tick',
    });

    // Flush: tick completes, directive starts
    await vi.advanceTimersByTimeAsync(0);

    // Respond to directive
    sendAgentResponse(drumsProc, {
      pattern: 's("bd cp")',
      thoughts: 'Directive',
      reaction: 'Directive',
    });
    await directivePromise;

    const jamStateUpdates = broadcast.mock.calls
      .filter(([msg]: unknown[]) => (msg as { type: string }).type === 'jam_state_update')
      .map(([msg]: unknown[]) => (msg as { payload: { jamState: { currentRound: number } } }).payload.jamState.currentRound);
    expect(jamStateUpdates).toEqual([1, 2, 3]);

    const snapshot = manager.getJamStateSnapshot();
    expect(snapshot.currentRound).toBe(3);
    expect(snapshot.agents.drums?.pattern).toBe('s("bd cp")');
    expect(snapshot.agents.drums?.status).toBe('playing');

    await manager.stop();
  });

  it('stop during queued turn prevents stale execution', async () => {
    const { manager, broadcast, processes } = createTestManager();

    const startPromise = manager.start(['drums']);
    await vi.advanceTimersByTimeAsync(0);

    const drumsProc = getNthProcess(processes, 0);

    // Respond to jam-start
    sendAgentResponse(drumsProc, {
      pattern: 's("bd")',
      thoughts: 'Start',
      reaction: 'Go',
    });
    await startPromise;

    // Trigger a tick
    vi.advanceTimersByTime(30000);
    await vi.advanceTimersByTimeAsync(0);

    // Queue a directive behind the tick
    const directivePromise = manager.handleDirective('Test', 'drums', ['drums']);

    // Stop the manager while tick is in-flight
    const stopPromise = manager.stop();

    // Respond to tick (in-flight turn completes)
    sendAgentResponse(drumsProc, {
      pattern: 's("bd sd")',
      thoughts: 'Tick',
      reaction: 'Tick',
    });

    await vi.advanceTimersByTimeAsync(0);

    // The directive should see this.stopped and return early
    await directivePromise;
    await stopPromise;

    // Count jam_state_update broadcasts — the directive should NOT have
    // produced one because this.stopped was true
    const jamStateUpdates = broadcast.mock.calls
      .filter(([msg]: unknown[]) => (msg as { type: string }).type === 'jam_state_update');

    // Only jam-start should have broadcast a jam_state_update (round 1).
    // The tick may or may not broadcast depending on timing — but the
    // directive definitely should NOT have broadcast.
    const directiveRound = jamStateUpdates.find(
      ([msg]: unknown[]) =>
        (msg as { payload: { jamState: { currentRound: number } } }).payload.jamState.currentRound === 3
    );
    expect(directiveRound).toBeUndefined();
  });

  it('stop prevents in-flight directive from re-arming auto-tick', async () => {
    const { manager, processes } = createTestManager();

    const startPromise = manager.start(['drums']);
    await vi.advanceTimersByTimeAsync(0);

    const drumsProc = getNthProcess(processes, 0);
    sendAgentResponse(drumsProc, {
      pattern: 's("bd sd")',
      thoughts: 'Start',
      reaction: 'Go',
    });
    await startPromise;

    const directivePromise = manager.handleDirective('Lock in the groove', 'drums', ['drums']);
    await vi.advanceTimersByTimeAsync(0);

    // Stop while directive is waiting for the agent response.
    const stopPromise = manager.stop();

    sendAgentResponse(drumsProc, {
      pattern: 's("bd sd cp sd")',
      thoughts: 'Locked in',
      reaction: 'Aye',
    });

    await directivePromise;
    await stopPromise;
    await vi.advanceTimersByTimeAsync(0);

    const rawManager = manager as unknown as { tickTimer: NodeJS.Timeout | null };
    expect(rawManager.tickTimer).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('coalesces auto-ticks to one pending turn under load', async () => {
    const { manager, processes } = createTestManager();

    const startPromise = manager.start(['drums']);
    await vi.advanceTimersByTimeAsync(0);

    const drumsProc = getNthProcess(processes, 0);
    sendAgentResponse(drumsProc, {
      pattern: 's("bd sd")',
      thoughts: 'Start',
      reaction: 'Go',
    });
    await startPromise;

    type TestAgentResponse = { pattern: string; thoughts: string; reaction: string } | null;
    let resolveBlockedTick: ((value: TestAgentResponse) => void) | undefined;
    const blockedTick = new Promise<TestAgentResponse>((resolve) => {
      resolveBlockedTick = resolve;
    });

    // Force auto-ticks to block so repeated interval firings would enqueue backlog
    // if coalescing is not implemented.
    const rawManager = manager as unknown as {
      sendToAgentAndCollect: (key: string, text: string) => Promise<TestAgentResponse>;
      turnCounter: number;
    };
    const originalSendToAgentAndCollect = rawManager.sendToAgentAndCollect.bind(manager);
    rawManager.sendToAgentAndCollect = vi.fn((key: string, text: string) => {
      if (text.includes('AUTO-TICK')) {
        return blockedTick;
      }
      return originalSendToAgentAndCollect(key, text);
    });

    // First auto-tick starts and blocks.
    vi.advanceTimersByTime(30000);
    await vi.advanceTimersByTimeAsync(0);

    // Multiple interval firings while blocked should not enqueue more turns.
    vi.advanceTimersByTime(120000);
    await vi.advanceTimersByTimeAsync(0);

    // jam-start = turn #1, first auto-tick = turn #2
    expect(rawManager.turnCounter).toBe(2);

    resolveBlockedTick?.({
      pattern: 'no_change',
      thoughts: 'Hold',
      reaction: 'Steady',
    });
    await vi.advanceTimersByTimeAsync(0);

    await manager.stop();
  });
});

// ─── Musical Context Update Tests ────────────────────────────────

describe('AgentProcessManager musical context updates', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockImplementation(default_exists_sync_impl);
    setupRuntimeCheckMocks();
  });

  afterEach(async () => {
    vi.useRealTimers();
  });

  it('directive with key/BPM updates musical context in broadcast', async () => {
    const { manager, broadcast, processes } = createTestManager();

    const startPromise = manager.start(['drums']);
    await vi.advanceTimersByTimeAsync(0);

    const drumsProc = getNthProcess(processes, 0);
    sendAgentResponse(drumsProc, {
      pattern: 's("bd sd")',
      thoughts: 'Opening',
      reaction: 'Go!',
    });
    await startPromise;

    // Send directive with key and BPM changes
    const directivePromise = manager.handleDirective(
      'Switch to D major, BPM 140',
      'drums',
      ['drums']
    );
    await vi.advanceTimersByTimeAsync(0);

    sendAgentResponse(drumsProc, {
      pattern: 's("bd sd bd sd")',
      thoughts: 'Adjusted to D major',
      reaction: 'New key!',
    });
    await directivePromise;

    const executeMessages = broadcast.mock.calls
      .map(([msg]: unknown[]) => msg as { type: string; payload?: { code?: string } })
      .filter((msg) => msg.type === 'execute');
    expect(executeMessages.length).toBeGreaterThanOrEqual(2); // jam-start + directive
    expect(executeMessages[executeMessages.length - 1].payload?.code).toBe('s("bd sd bd sd")');

    // Find the jam_state_update from the directive (round 2)
    const directiveJamState = getJamStateForRound(broadcast, 2);

    expect(directiveJamState).toBeDefined();
    expect(directiveJamState!.musicalContext.key).toBe('D major');
    expect(directiveJamState!.musicalContext.bpm).toBe(140);
    expect(directiveJamState!.musicalContext.scale).toEqual([
      'D', 'E', 'F#', 'G', 'A', 'B', 'C#',
    ]);

    await manager.stop();
  });

  it('relative energy change uses model decision delta', async () => {
    const { manager, broadcast, processes } = createTestManager();

    const startPromise = manager.start(['drums']);
    await vi.advanceTimersByTimeAsync(0);

    const drumsProc = getNthProcess(processes, 0);
    sendAgentResponse(drumsProc, {
      pattern: 's("bd sd")',
      thoughts: 'Opening',
      reaction: 'Go!',
    });
    await startPromise;

    // Relative energy comes from model decision (not hardcoded +2)
    const directivePromise = manager.handleDirective(
      'more energy!',
      'drums',
      ['drums']
    );
    await vi.advanceTimersByTimeAsync(0);

    sendAgentResponse(drumsProc, {
      pattern: 's("bd sd bd sd").gain(1.2)',
      thoughts: 'Pumping it up',
      reaction: 'Energy!',
      decision: {
        energy_delta: 1,
        confidence: 'high',
      },
    });
    await directivePromise;

    const directiveJamState = getJamStateForRound(broadcast, 2);

    expect(directiveJamState!.musicalContext.energy).toBe(6);

    await manager.stop();
  });

  it('relative tempo cue without model decision keeps BPM unchanged', async () => {
    const { manager, broadcast, processes } = createTestManager();

    const startPromise = manager.start(['drums']);
    await vi.advanceTimersByTimeAsync(0);

    const drumsProc = getNthProcess(processes, 0);
    sendAgentResponse(drumsProc, {
      pattern: 's("bd sd")',
      thoughts: 'Opening',
      reaction: 'Go!',
    });
    await startPromise;

    const directivePromise = manager.handleDirective(
      'a bit faster',
      'drums',
      ['drums']
    );
    await vi.advanceTimersByTimeAsync(0);

    sendAgentResponse(drumsProc, {
      pattern: 's("bd sd bd sd")',
      thoughts: 'I can push the feel without changing global BPM',
      reaction: 'Leaning in',
    });
    await directivePromise;

    const directiveJamState = getJamStateForRound(broadcast, 2);
    expect(directiveJamState!.musicalContext.bpm).toBe(120);

    await manager.stop();
  });

  it('explicit BPM stays deterministic even when model returns tempo delta', async () => {
    const { manager, broadcast, processes } = createTestManager();

    const startPromise = manager.start(['drums']);
    await vi.advanceTimersByTimeAsync(0);

    const drumsProc = getNthProcess(processes, 0);
    sendAgentResponse(drumsProc, {
      pattern: 's("bd sd")',
      thoughts: 'Opening',
      reaction: 'Go!',
    });
    await startPromise;

    const directivePromise = manager.handleDirective(
      'BPM 140 and faster',
      'drums',
      ['drums']
    );
    await vi.advanceTimersByTimeAsync(0);

    sendAgentResponse(drumsProc, {
      pattern: 's("bd sd bd sd").fast(2)',
      thoughts: 'Locking to the requested BPM anchor',
      reaction: '140 exactly',
      decision: {
        tempo_delta_pct: 25,
        confidence: 'high',
      },
    });
    await directivePromise;

    const directiveJamState = getJamStateForRound(broadcast, 2);
    expect(directiveJamState!.musicalContext.bpm).toBe(140);

    await manager.stop();
  });

  it('half-time stays deterministic even when model returns tempo delta', async () => {
    const { manager, broadcast, processes } = createTestManager();

    const startPromise = manager.start(['drums']);
    await vi.advanceTimersByTimeAsync(0);

    const drumsProc = getNthProcess(processes, 0);
    sendAgentResponse(drumsProc, {
      pattern: 's("bd sd")',
      thoughts: 'Opening',
      reaction: 'Go!',
    });
    await startPromise;

    const directivePromise = manager.handleDirective(
      'half time feel, but keep it moving',
      'drums',
      ['drums']
    );
    await vi.advanceTimersByTimeAsync(0);

    sendAgentResponse(drumsProc, {
      pattern: 's("bd ~ sd ~")',
      thoughts: 'Half-time pocket',
      reaction: 'Slower feel, same focus',
      decision: {
        tempo_delta_pct: 40,
        confidence: 'high',
      },
    });
    await directivePromise;

    const directiveJamState = getJamStateForRound(broadcast, 2);
    expect(directiveJamState!.musicalContext.bpm).toBe(60);

    await manager.stop();
  });

  it('subtle vs strong tempo directives can apply different model delta magnitudes', async () => {
    const { manager, broadcast, processes } = createTestManager();

    const startPromise = manager.start(['drums']);
    await vi.advanceTimersByTimeAsync(0);

    const drumsProc = getNthProcess(processes, 0);
    sendAgentResponse(drumsProc, {
      pattern: 's("bd sd")',
      thoughts: 'Opening',
      reaction: 'Go!',
    });
    await startPromise;

    const subtleDirective = manager.handleDirective(
      'a bit faster',
      'drums',
      ['drums']
    );
    await vi.advanceTimersByTimeAsync(0);
    sendAgentResponse(drumsProc, {
      pattern: 's("bd sd bd sd")',
      thoughts: 'Small push',
      reaction: 'Just a nudge',
      decision: {
        tempo_delta_pct: 5,
        confidence: 'high',
      },
    });
    await subtleDirective;

    const strongDirective = manager.handleDirective(
      'way faster',
      'drums',
      ['drums']
    );
    await vi.advanceTimersByTimeAsync(0);
    sendAgentResponse(drumsProc, {
      pattern: 's("bd*2 sd*2")',
      thoughts: 'Bigger lift',
      reaction: 'Pushing harder',
      decision: {
        tempo_delta_pct: 25,
        confidence: 'high',
      },
    });
    await strongDirective;

    const subtleJamState = getJamStateForRound(broadcast, 2);
    const strongJamState = getJamStateForRound(broadcast, 3);

    expect(subtleJamState!.musicalContext.bpm).toBe(126); // 120 + round(120*0.05)
    expect(strongJamState!.musicalContext.bpm).toBe(158); // 126 + round(126*0.25)
    expect(strongJamState!.musicalContext.bpm).toBeGreaterThan(subtleJamState!.musicalContext.bpm);

    await manager.stop();
  });

  it('broadcast relative decisions use confidence-weighted averaging', async () => {
    const { manager, broadcast, processes } = createTestManager();

    const startPromise = manager.start(['drums', 'bass']);
    await vi.advanceTimersByTimeAsync(0);

    const drumsProc = getProcessByKey(processes, 'drums');
    const bassProc = getProcessByKey(processes, 'bass');
    sendAgentResponse(drumsProc, {
      pattern: 's("bd sd")',
      thoughts: 'Opening drums',
      reaction: 'Go!',
    });
    sendAgentResponse(bassProc, {
      pattern: 'note("c2 g2")',
      thoughts: 'Opening bass',
      reaction: 'Locked!',
    });
    await startPromise;

    const directivePromise = manager.handleDirective(
      'faster and more energy',
      undefined,
      ['drums', 'bass']
    );
    await vi.advanceTimersByTimeAsync(0);

    sendAgentResponse(drumsProc, {
      pattern: 's("bd sd bd sd").gain(1.1)',
      thoughts: 'Drive the pulse',
      reaction: 'Building',
      decision: {
        tempo_delta_pct: 20,
        energy_delta: 2,
        confidence: 'high',
      },
    });
    sendAgentResponse(bassProc, {
      pattern: 'note("c2 c2 g2 c3").gain(1.1)',
      thoughts: 'Push with restraint',
      reaction: 'Leaning forward',
      decision: {
        tempo_delta_pct: 20,
        energy_delta: 2,
        confidence: 'medium',
      },
    });
    await directivePromise;

    const directiveJamState = getJamStateForRound(broadcast, 2);

    // tempo avg = round((20 + 10) / 2) = 15% => 120 + round(18) = 138
    // energy avg = round((2 + 1) / 2) = 2 => 5 + 2 = 7
    expect(directiveJamState!.musicalContext.bpm).toBe(138);
    expect(directiveJamState!.musicalContext.energy).toBe(7);

    await manager.stop();
  });

  it('low-confidence relative decisions do not mutate context', async () => {
    const { manager, broadcast, processes } = createTestManager();

    const startPromise = manager.start(['drums']);
    await vi.advanceTimersByTimeAsync(0);

    const drumsProc = getNthProcess(processes, 0);
    sendAgentResponse(drumsProc, {
      pattern: 's("bd sd")',
      thoughts: 'Opening',
      reaction: 'Go!',
    });
    await startPromise;

    const directivePromise = manager.handleDirective(
      'slower and chill',
      'drums',
      ['drums']
    );
    await vi.advanceTimersByTimeAsync(0);

    sendAgentResponse(drumsProc, {
      pattern: 's("bd ~ sd ~")',
      thoughts: 'Maybe hold for now',
      reaction: 'Not confident in a big shift',
      decision: {
        tempo_delta_pct: -20,
        energy_delta: -2,
        confidence: 'low',
      },
    });
    await directivePromise;

    const directiveJamState = getJamStateForRound(broadcast, 2);
    expect(directiveJamState!.musicalContext.bpm).toBe(120);
    expect(directiveJamState!.musicalContext.energy).toBe(5);

    await manager.stop();
  });

  it('direction-mismatched relative decisions are ignored', async () => {
    const { manager, broadcast, processes } = createTestManager();

    const startPromise = manager.start(['drums']);
    await vi.advanceTimersByTimeAsync(0);

    const drumsProc = getNthProcess(processes, 0);
    sendAgentResponse(drumsProc, {
      pattern: 's("bd sd")',
      thoughts: 'Opening',
      reaction: 'Go!',
    });
    await startPromise;

    const directivePromise = manager.handleDirective(
      'slower and less energy',
      'drums',
      ['drums']
    );
    await vi.advanceTimersByTimeAsync(0);

    sendAgentResponse(drumsProc, {
      pattern: 's("bd sd")',
      thoughts: 'I misread the boss on purpose for this test',
      reaction: 'Oops',
      decision: {
        tempo_delta_pct: 15,
        energy_delta: 2,
        confidence: 'high',
      },
    });
    await directivePromise;

    const directiveJamState = getJamStateForRound(broadcast, 2);
    expect(directiveJamState!.musicalContext.bpm).toBe(120);
    expect(directiveJamState!.musicalContext.energy).toBe(5);

    await manager.stop();
  });

  it('medium-confidence negative one-step energy change applies symmetrically', async () => {
    const { manager, broadcast, processes } = createTestManager();

    const startPromise = manager.start(['drums']);
    await vi.advanceTimersByTimeAsync(0);

    const drumsProc = getNthProcess(processes, 0);
    sendAgentResponse(drumsProc, {
      pattern: 's("bd sd")',
      thoughts: 'Opening',
      reaction: 'Go!',
    });
    await startPromise;

    const directivePromise = manager.handleDirective(
      'chill a bit',
      'drums',
      ['drums']
    );
    await vi.advanceTimersByTimeAsync(0);

    sendAgentResponse(drumsProc, {
      pattern: 's("bd ~ sd ~")',
      thoughts: 'Conservative pullback',
      reaction: 'Cooling down',
      decision: {
        energy_delta: -1,
        confidence: 'medium',
      },
    });
    await directivePromise;

    const directiveJamState = getJamStateForRound(broadcast, 2);
    expect(directiveJamState!.musicalContext.energy).toBe(4);

    await manager.stop();
  });

  it('non-musical directive leaves context unchanged', async () => {
    const { manager, broadcast, processes } = createTestManager();

    const startPromise = manager.start(['drums']);
    await vi.advanceTimersByTimeAsync(0);

    const drumsProc = getNthProcess(processes, 0);
    sendAgentResponse(drumsProc, {
      pattern: 's("bd sd")',
      thoughts: 'Opening',
      reaction: 'Go!',
    });
    await startPromise;

    // "More cowbell" has no musical context keywords
    const directivePromise = manager.handleDirective(
      'More cowbell!',
      'drums',
      ['drums']
    );
    await vi.advanceTimersByTimeAsync(0);

    sendAgentResponse(drumsProc, {
      pattern: 's("bd sd cp sd")',
      thoughts: 'Added cowbell',
      reaction: 'Cowbell!',
    });
    await directivePromise;

    const directiveJamState = getJamStateForRound(broadcast, 2);

    // Context should remain at defaults
    expect(directiveJamState!.musicalContext.key).toBe('C minor');
    expect(directiveJamState!.musicalContext.bpm).toBe(120);
    expect(directiveJamState!.musicalContext.energy).toBe(5);

    await manager.stop();
  });
});

// ─── Directive Targeting Tests ───────────────────────────────────

describe('AgentProcessManager directive targeting', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockImplementation(default_exists_sync_impl);
    setupRuntimeCheckMocks();
  });

  afterEach(async () => {
    vi.useRealTimers();
  });

  it('returns directive_error when target agent is not in session', async () => {
    const { manager, broadcast, processes } = createTestManager();

    // Start with only drums
    const startPromise = manager.start(['drums']);
    await vi.advanceTimersByTimeAsync(0);

    const drumsProc = getNthProcess(processes, 0);
    sendAgentResponse(drumsProc, {
      pattern: 's("bd sd")',
      thoughts: 'Opening',
      reaction: 'Go!',
    });
    await startPromise;

    broadcast.mockClear();

    // Target bass, which is NOT in activeAgents
    const directivePromise = manager.handleDirective(
      'play a bassline',
      'bass',
      ['drums']
    );
    await directivePromise;

    // Should broadcast a directive_error
    const errorMsgs = broadcast.mock.calls
      .filter(([msg]: unknown[]) => (msg as { type: string }).type === 'directive_error');
    expect(errorMsgs).toHaveLength(1);
    expect((errorMsgs[0][0] as { payload: { message: string } }).payload.message)
      .toBe('GROOVE is not in this jam session');

    // Should NOT broadcast jam_state_update (no round increment)
    const jamStateUpdates = broadcast.mock.calls
      .filter(([msg]: unknown[]) => (msg as { type: string }).type === 'jam_state_update');
    expect(jamStateUpdates).toHaveLength(0);

    // Round should remain at 1 (only jam-start incremented it)
    const snapshot = manager.getJamStateSnapshot();
    expect(snapshot.currentRound).toBe(1);

    await manager.stop();
  });

  it('returns directive_error when target agent process has crashed', async () => {
    const { manager, broadcast, processes } = createTestManager();

    // Start with drums and bass
    const startPromise = manager.start(['drums', 'bass']);
    await vi.advanceTimersByTimeAsync(0);

    const drumsProc = getProcessByKey(processes, 'drums');
    const bassProc = getProcessByKey(processes, 'bass');
    sendAgentResponse(drumsProc, {
      pattern: 's("bd sd")',
      thoughts: 'Opening drums',
      reaction: 'Go!',
    });
    sendAgentResponse(bassProc, {
      pattern: 'note("c2 g2")',
      thoughts: 'Opening bass',
      reaction: 'Locked!',
    });
    await startPromise;

    // Simulate bass process crashing (exit handler removes from this.agents)
    bassProc.emit('exit', 1, 'SIGTERM');
    await vi.advanceTimersByTimeAsync(0);

    broadcast.mockClear();

    // Target bass, which was selected but its process is gone
    const directivePromise = manager.handleDirective(
      'slap bass!',
      'bass',
      ['drums', 'bass']
    );
    await directivePromise;

    // Should broadcast directive_error with "unavailable"
    const errorMsgs = broadcast.mock.calls
      .filter(([msg]: unknown[]) => (msg as { type: string }).type === 'directive_error');
    expect(errorMsgs).toHaveLength(1);
    expect((errorMsgs[0][0] as { payload: { message: string } }).payload.message)
      .toBe("GROOVE's process is unavailable");

    await manager.stop();
  });

  it('auto-tick does not clear error status for crashed agents', async () => {
    const { manager, processes } = createTestManager();

    const startPromise = manager.start(['drums', 'bass']);
    await vi.advanceTimersByTimeAsync(0);

    const drumsProc = getProcessByKey(processes, 'drums');
    const bassProc = getProcessByKey(processes, 'bass');
    sendAgentResponse(drumsProc, {
      pattern: 's("bd sd")',
      thoughts: 'Opening drums',
      reaction: 'Go!',
    });
    sendAgentResponse(bassProc, {
      pattern: 'note("c2 g2")',
      thoughts: 'Opening bass',
      reaction: 'Locked!',
    });
    await startPromise;

    // Crash bass and verify immediate error status.
    bassProc.emit('exit', 1, 'SIGTERM');
    await vi.advanceTimersByTimeAsync(0);
    expect(manager.getJamStateSnapshot().agents.bass?.status).toBe('error');

    // Advance to auto-tick and respond only for healthy drums.
    vi.advanceTimersByTime(30000);
    await vi.advanceTimersByTimeAsync(0);
    sendAgentResponse(drumsProc, {
      pattern: 's("bd sd bd sd")',
      thoughts: 'Evolving drums',
      reaction: 'Still driving',
    });
    await vi.advanceTimersByTimeAsync(0);

    // Crashed bass remains error after auto-tick.
    expect(manager.getJamStateSnapshot().agents.bass?.status).toBe('error');

    await manager.stop();
  });

  it('routes directive to exactly one agent when target is alive', async () => {
    const { manager, broadcast, processes } = createTestManager();

    // Start with drums and bass
    const startPromise = manager.start(['drums', 'bass']);
    await vi.advanceTimersByTimeAsync(0);

    const drumsProc = getProcessByKey(processes, 'drums');
    const bassProc = getProcessByKey(processes, 'bass');
    sendAgentResponse(drumsProc, {
      pattern: 's("bd sd")',
      thoughts: 'Opening drums',
      reaction: 'Go!',
    });
    sendAgentResponse(bassProc, {
      pattern: 'note("c2 g2")',
      thoughts: 'Opening bass',
      reaction: 'Locked!',
    });
    await startPromise;

    broadcast.mockClear();

    // Target drums specifically
    const directivePromise = manager.handleDirective(
      'more cowbell!',
      'drums',
      ['drums', 'bass']
    );
    await vi.advanceTimersByTimeAsync(0);

    // Only drums should receive the directive — respond only from drums
    sendAgentResponse(drumsProc, {
      pattern: 's("bd sd cp sd")',
      thoughts: 'Added cowbell',
      reaction: 'Cowbell!',
    });
    await directivePromise;

    // Should NOT have directive_error
    const errorMsgs = broadcast.mock.calls
      .filter(([msg]: unknown[]) => (msg as { type: string }).type === 'directive_error');
    expect(errorMsgs).toHaveLength(0);

    // Only drums should have an agent_thought broadcast
    const thoughts = broadcast.mock.calls
      .filter(([msg]: unknown[]) => (msg as { type: string }).type === 'agent_thought')
      .map(([msg]: unknown[]) => (msg as { payload: { agent: string } }).payload.agent);
    expect(thoughts).toEqual(['drums']);

    await manager.stop();
  });

  it('auto-tick resumes after failed directive', async () => {
    const { manager, broadcast, processes } = createTestManager();

    // Start with only drums
    const startPromise = manager.start(['drums']);
    await vi.advanceTimersByTimeAsync(0);

    const drumsProc = getNthProcess(processes, 0);
    sendAgentResponse(drumsProc, {
      pattern: 's("bd sd")',
      thoughts: 'Opening',
      reaction: 'Go!',
    });
    await startPromise;

    // Send a failing directive (target bass, not in session)
    const directivePromise = manager.handleDirective(
      'play a bassline',
      'bass',
      ['drums']
    );
    await directivePromise;

    // The auto-tick timer should have been re-armed
    const rawManager = manager as unknown as { tickTimer: NodeJS.Timeout | null };
    expect(rawManager.tickTimer).not.toBeNull();

    broadcast.mockClear();

    // Advance time to trigger auto-tick — proves timer was re-armed
    vi.advanceTimersByTime(30000);
    await vi.advanceTimersByTimeAsync(0);

    // Respond to the auto-tick
    sendAgentResponse(drumsProc, {
      pattern: 's("bd sd bd sd")',
      thoughts: 'Evolving',
      reaction: 'Growing',
    });
    await vi.advanceTimersByTimeAsync(0);

    // Should have a jam_state_update from the auto-tick
    const jamStateUpdates = broadcast.mock.calls
      .filter(([msg]: unknown[]) => (msg as { type: string }).type === 'jam_state_update');
    expect(jamStateUpdates.length).toBeGreaterThanOrEqual(1);

    await manager.stop();
  });
});

describe('AgentProcessManager jam state snapshots', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockImplementation(default_exists_sync_impl);
    setupRuntimeCheckMocks();
  });

  afterEach(async () => {
    vi.useRealTimers();
  });

  it('snapshot stays consistent with latest jam_state_update broadcast', async () => {
    const { manager, broadcast, processes } = createTestManager();

    const startPromise = manager.start(['drums', 'bass']);
    await vi.advanceTimersByTimeAsync(0);

    const drumsProc = getProcessByKey(processes, 'drums');
    const bassProc = getProcessByKey(processes, 'bass');

    sendAgentResponse(drumsProc, {
      pattern: 's("bd sd")',
      thoughts: 'Opening drums',
      reaction: 'Locked',
    });
    sendAgentResponse(bassProc, {
      pattern: 'note("c2 g2").s("sawtooth")',
      thoughts: 'Opening bass',
      reaction: 'Holding root',
    });
    await startPromise;

    const directivePromise = manager.handleDirective(
      'Switch to D major, BPM 140, more energy',
      undefined,
      ['drums', 'bass']
    );
    await vi.advanceTimersByTimeAsync(0);

    sendAgentResponse(drumsProc, {
      pattern: 's("bd sd bd sd").fast(2)',
      thoughts: 'Pushing tempo',
      reaction: 'Driving',
    });
    sendAgentResponse(bassProc, {
      pattern: 'note("d2 a2").s("sawtooth").gain(1.1)',
      thoughts: 'Following new key',
      reaction: 'Supporting',
    });
    await directivePromise;

    const latestJamState = getLatestJamState(broadcast) as {
      currentRound: number;
      musicalContext: unknown;
      agents: unknown;
      activeAgents: unknown;
    };
    const snapshot = manager.getJamStateSnapshot();

    expect(latestJamState).toBeDefined();
    expect(snapshot.currentRound).toBe(latestJamState.currentRound);
    expect(snapshot.musicalContext).toEqual(latestJamState.musicalContext);
    expect(snapshot.agents).toEqual(latestJamState.agents);
    expect(snapshot.activeAgents).toEqual(latestJamState.activeAgents);

    await manager.stop();
  });
});

describe('AgentProcessManager auto-tick context drift', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockImplementation(default_exists_sync_impl);
    setupRuntimeCheckMocks();
  });

  afterEach(async () => {
    vi.useRealTimers();
  });

  it('auto-tick aggregates tempo/energy decisions with dampening', async () => {
    const { manager, broadcast, processes } = createTestManager();

    const startPromise = manager.start(['drums', 'bass']);
    await vi.advanceTimersByTimeAsync(0);

    // Respond to jam-start
    for (const key of ['drums', 'bass']) {
      const proc = getProcessByKey(processes, key);
      sendAgentResponse(proc, {
        pattern: `s("${key}")`,
        thoughts: 'Opening',
        reaction: 'Go',
      });
    }
    await startPromise;

    // Initial context: BPM 120, energy 5

    // Trigger auto-tick
    vi.advanceTimersByTime(30000);
    await vi.advanceTimersByTimeAsync(0);

    // Both agents suggest tempo increase (+10%) and energy increase (+2) with high confidence
    for (const key of ['drums', 'bass']) {
      const proc = getProcessByKey(processes, key);
      sendAgentResponse(proc, {
        pattern: 'no_change',
        thoughts: 'Building energy',
        reaction: 'Let us go!',
        decision: {
          tempo_delta_pct: 10,
          energy_delta: 2,
          confidence: 'high',
        },
      });
    }

    await vi.advanceTimersByTimeAsync(0);

    const jamState = getLatestJamState(broadcast);
    expect(jamState).toBeDefined();
    // 10% of 120 = 12, dampened 0.5x = 6 → BPM 126
    expect(jamState!.musicalContext.bpm).toBe(126);
    // energy_delta 2, dampened 0.5x = 1 → energy 6
    expect(jamState!.musicalContext.energy).toBe(6);

    await manager.stop();
  });

  it('auto-tick ignores low-confidence decisions', async () => {
    const { manager, broadcast, processes } = createTestManager();

    const startPromise = manager.start(['drums']);
    await vi.advanceTimersByTimeAsync(0);

    sendAgentResponse(getProcessByKey(processes, 'drums'), {
      pattern: 's("bd")',
      thoughts: 'Opening',
      reaction: 'Go',
    });
    await startPromise;

    vi.advanceTimersByTime(30000);
    await vi.advanceTimersByTimeAsync(0);

    // Low confidence → multiplier 0 → effectively zero
    sendAgentResponse(getProcessByKey(processes, 'drums'), {
      pattern: 'no_change',
      thoughts: 'Unsure',
      reaction: 'Hmm',
      decision: {
        tempo_delta_pct: 20,
        energy_delta: 3,
        confidence: 'low',
      },
    });

    await vi.advanceTimersByTimeAsync(0);

    const jamState = getLatestJamState(broadcast);
    expect(jamState).toBeDefined();
    // Nothing should change — low confidence produces 0
    expect(jamState!.musicalContext.bpm).toBe(120);
    expect(jamState!.musicalContext.energy).toBe(5);

    await manager.stop();
  });

  it('auto-tick clamps BPM and energy to bounds', async () => {
    const { manager, broadcast, processes } = createTestManager();

    const startPromise = manager.start(['drums', 'bass']);
    await vi.advanceTimersByTimeAsync(0);

    for (const key of ['drums', 'bass']) {
      sendAgentResponse(getProcessByKey(processes, key), {
        pattern: `s("${key}")`,
        thoughts: 'Opening',
        reaction: 'Go',
      });
    }
    await startPromise;

    vi.advanceTimersByTime(30000);
    await vi.advanceTimersByTimeAsync(0);

    // Both agents suggest max increase
    for (const key of ['drums', 'bass']) {
      sendAgentResponse(getProcessByKey(processes, key), {
        pattern: 'no_change',
        thoughts: 'Max it',
        reaction: 'Full throttle',
        decision: {
          tempo_delta_pct: 50,
          energy_delta: 3,
          confidence: 'high',
        },
      });
    }

    await vi.advanceTimersByTimeAsync(0);

    const jamState = getLatestJamState(broadcast);
    expect(jamState).toBeDefined();
    // 50% of 120 = 60, dampened 0.5x = 30 → 150, clamped to 300 (within bounds)
    expect(jamState!.musicalContext.bpm).toBe(150);
    // energy 3, dampened 0.5x = 1.5, rounded = 2 → 5+2=7, clamped to 10 (within bounds)
    expect(jamState!.musicalContext.energy).toBe(7);

    await manager.stop();
  });
});

describe('AgentProcessManager context suggestions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockImplementation(default_exists_sync_impl);
    setupRuntimeCheckMocks();
  });

  afterEach(async () => {
    vi.useRealTimers();
  });

  it('applies key change when 2+ agents suggest the same key', async () => {
    const { manager, broadcast, processes } = createTestManager();

    const startPromise = manager.start(['drums', 'bass', 'melody']);
    await vi.advanceTimersByTimeAsync(0);

    for (const key of ['drums', 'bass', 'melody']) {
      sendAgentResponse(getProcessByKey(processes, key), {
        pattern: `s("${key}")`,
        thoughts: 'Opening',
        reaction: 'Go',
      });
    }
    await startPromise;

    // Initial key: "C minor"

    vi.advanceTimersByTime(30000);
    await vi.advanceTimersByTimeAsync(0);

    // Melody and bass both suggest Eb major
    sendAgentResponse(getProcessByKey(processes, 'drums'), {
      pattern: 'no_change',
      thoughts: 'Steady',
      reaction: 'Staying put',
    });
    sendAgentResponse(getProcessByKey(processes, 'bass'), {
      pattern: 'no_change',
      thoughts: 'Following melody',
      reaction: 'Eb sounds right',
      decision: { suggested_key: 'Eb major', confidence: 'high' },
    });
    sendAgentResponse(getProcessByKey(processes, 'melody'), {
      pattern: 'no_change',
      thoughts: 'Time for relative major',
      reaction: 'Modulating to Eb',
      decision: { suggested_key: 'Eb major', confidence: 'high' },
    });

    await vi.advanceTimersByTimeAsync(0);

    const jamState = getLatestJamState(broadcast);
    expect(jamState).toBeDefined();
    expect(jamState!.musicalContext.key).toBe('Eb major');
    expect(jamState!.musicalContext.scale).toEqual(['Eb', 'F', 'G', 'Ab', 'Bb', 'C', 'D']);

    await manager.stop();
  });

  it('applies key change when suggestions differ only by casing', async () => {
    const { manager, broadcast, processes } = createTestManager();

    const startPromise = manager.start(['drums', 'bass', 'melody']);
    await vi.advanceTimersByTimeAsync(0);

    for (const key of ['drums', 'bass', 'melody']) {
      sendAgentResponse(getProcessByKey(processes, key), {
        pattern: `s("${key}")`,
        thoughts: 'Opening',
        reaction: 'Go',
      });
    }
    await startPromise;

    vi.advanceTimersByTime(30000);
    await vi.advanceTimersByTimeAsync(0);

    sendAgentResponse(getProcessByKey(processes, 'drums'), {
      pattern: 'no_change',
      thoughts: 'Steady',
      reaction: 'Holding',
    });
    sendAgentResponse(getProcessByKey(processes, 'bass'), {
      pattern: 'no_change',
      thoughts: 'Relative major feels right',
      reaction: 'Eb?',
      decision: { suggested_key: 'eb major', confidence: 'high' },
    });
    sendAgentResponse(getProcessByKey(processes, 'melody'), {
      pattern: 'no_change',
      thoughts: 'Agree on modulation',
      reaction: 'EB major',
      decision: { suggested_key: 'EB major', confidence: 'high' },
    });

    await vi.advanceTimersByTimeAsync(0);

    const jamState = getLatestJamState(broadcast);
    expect(jamState).toBeDefined();
    expect(jamState!.musicalContext.key).toBe('Eb major');
    expect(jamState!.musicalContext.scale).toEqual(['Eb', 'F', 'G', 'Ab', 'Bb', 'C', 'D']);

    await manager.stop();
  });

  it('does not apply key change when only 1 agent suggests it', async () => {
    const { manager, broadcast, processes } = createTestManager();

    const startPromise = manager.start(['drums', 'bass']);
    await vi.advanceTimersByTimeAsync(0);

    for (const key of ['drums', 'bass']) {
      sendAgentResponse(getProcessByKey(processes, key), {
        pattern: `s("${key}")`,
        thoughts: 'Opening',
        reaction: 'Go',
      });
    }
    await startPromise;

    vi.advanceTimersByTime(30000);
    await vi.advanceTimersByTimeAsync(0);

    // Only bass suggests key change
    sendAgentResponse(getProcessByKey(processes, 'drums'), {
      pattern: 'no_change',
      thoughts: 'Steady',
      reaction: 'No change',
    });
    sendAgentResponse(getProcessByKey(processes, 'bass'), {
      pattern: 'no_change',
      thoughts: 'Want to modulate',
      reaction: 'D major?',
      decision: { suggested_key: 'D major', confidence: 'high' },
    });

    await vi.advanceTimersByTimeAsync(0);

    const jamState = getLatestJamState(broadcast);
    expect(jamState).toBeDefined();
    expect(jamState!.musicalContext.key).toBe('C minor'); // unchanged

    await manager.stop();
  });

  it('does not apply key change when consensus is low confidence', async () => {
    const { manager, broadcast, processes } = createTestManager();

    const startPromise = manager.start(['drums', 'bass', 'melody']);
    await vi.advanceTimersByTimeAsync(0);

    for (const key of ['drums', 'bass', 'melody']) {
      sendAgentResponse(getProcessByKey(processes, key), {
        pattern: `s("${key}")`,
        thoughts: 'Opening',
        reaction: 'Go',
      });
    }
    await startPromise;

    vi.advanceTimersByTime(30000);
    await vi.advanceTimersByTimeAsync(0);

    sendAgentResponse(getProcessByKey(processes, 'drums'), {
      pattern: 'no_change',
      thoughts: 'Steady',
      reaction: 'No change',
    });
    sendAgentResponse(getProcessByKey(processes, 'bass'), {
      pattern: 'no_change',
      thoughts: 'Maybe modulate',
      reaction: 'Not sure',
      decision: { suggested_key: 'Eb major', confidence: 'low' },
    });
    sendAgentResponse(getProcessByKey(processes, 'melody'), {
      pattern: 'no_change',
      thoughts: 'Could modulate later',
      reaction: 'Tentative',
      decision: { suggested_key: 'Eb major', confidence: 'low' },
    });

    await vi.advanceTimersByTimeAsync(0);

    const jamState = getLatestJamState(broadcast);
    expect(jamState).toBeDefined();
    expect(jamState!.musicalContext.key).toBe('C minor');
    expect(jamState!.musicalContext.scale).toEqual(['C', 'D', 'Eb', 'F', 'G', 'Ab', 'Bb']);

    await manager.stop();
  });

  it('applies chord suggestion with high confidence', async () => {
    const { manager, broadcast, processes } = createTestManager();

    const startPromise = manager.start(['drums', 'melody']);
    await vi.advanceTimersByTimeAsync(0);

    for (const key of ['drums', 'melody']) {
      sendAgentResponse(getProcessByKey(processes, key), {
        pattern: `s("${key}")`,
        thoughts: 'Opening',
        reaction: 'Go',
      });
    }
    await startPromise;

    vi.advanceTimersByTime(30000);
    await vi.advanceTimersByTimeAsync(0);

    sendAgentResponse(getProcessByKey(processes, 'drums'), {
      pattern: 'no_change',
      thoughts: 'Steady',
      reaction: 'No change',
    });
    sendAgentResponse(getProcessByKey(processes, 'melody'), {
      pattern: 'no_change',
      thoughts: 'New progression',
      reaction: 'Trying a ii-V-I',
      decision: {
        suggested_chords: ['Dm', 'G', 'Cm'],
        confidence: 'high',
      },
    });

    await vi.advanceTimersByTimeAsync(0);

    const jamState = getLatestJamState(broadcast);
    expect(jamState).toBeDefined();
    expect(jamState!.musicalContext.chordProgression).toEqual(['Dm', 'G', 'Cm']);

    await manager.stop();
  });

  it('does not apply chord suggestion with low confidence', async () => {
    const { manager, broadcast, processes } = createTestManager();

    const startPromise = manager.start(['drums', 'melody']);
    await vi.advanceTimersByTimeAsync(0);

    for (const key of ['drums', 'melody']) {
      sendAgentResponse(getProcessByKey(processes, key), {
        pattern: `s("${key}")`,
        thoughts: 'Opening',
        reaction: 'Go',
      });
    }
    await startPromise;

    vi.advanceTimersByTime(30000);
    await vi.advanceTimersByTimeAsync(0);

    sendAgentResponse(getProcessByKey(processes, 'drums'), {
      pattern: 'no_change',
      thoughts: 'Steady',
      reaction: 'No change',
    });
    sendAgentResponse(getProcessByKey(processes, 'melody'), {
      pattern: 'no_change',
      thoughts: 'Maybe change chords',
      reaction: 'Not sure though',
      decision: {
        suggested_chords: ['Am', 'F', 'C', 'G'],
        confidence: 'medium',
      },
    });

    await vi.advanceTimersByTimeAsync(0);

    const jamState = getLatestJamState(broadcast);
    expect(jamState).toBeDefined();
    // Original chords unchanged
    expect(jamState!.musicalContext.chordProgression).toEqual(['Cm', 'Ab', 'Eb', 'Bb']);

    await manager.stop();
  });
});
