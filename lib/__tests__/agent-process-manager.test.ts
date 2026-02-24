import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PassThrough } from 'stream';
import { EventEmitter } from 'events';

// ─── Mocks ──────────────────────────────────────────────────────────
// Mock child_process.spawn to return controllable fake processes
vi.mock('child_process', () => ({
  spawn: vi.fn(),
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
      return '---\nmodel: sonnet\n---\nYou are a test agent.';
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

// ─── Helpers ────────────────────────────────────────────────────────

/** Create a fake ChildProcess with controllable stdin/stdout/stderr. */
function createFakeProcess() {
  const stdin = new PassThrough();
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
  response: { pattern: string; thoughts: string; reaction: string }
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

/** Create a manager with mocked spawn, returns the manager + fake processes. */
function createTestManager(): {
  manager: AgentProcessManager;
  broadcast: ReturnType<typeof vi.fn>;
  processes: Map<string, ReturnType<typeof createFakeProcess>>;
} {
  const processes = new Map<string, ReturnType<typeof createFakeProcess>>();
  const broadcast = vi.fn() as ReturnType<typeof vi.fn> & BroadcastFn;

  mockedSpawn.mockImplementation((_cmd, _args) => {
    const proc = createFakeProcess();
    // Infer agent key from args: look for --system-prompt value
    // The spawn call order matches activeAgents order
    const key = `proc_${processes.size}`;
    processes.set(key, proc);
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
    const { manager, processes } = createTestManager();

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

    // The test verifies the turns serialized (no overlapping listeners)
    // by confirming both completed without errors or garbled responses
    // If listeners overlapped, one response would be consumed by the wrong
    // handler, causing a timeout or incorrect pattern.
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

  it('relative energy change propagates through broadcast', async () => {
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

    // "more energy" should bump default 5 → 7
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
    });
    await directivePromise;

    const directiveJamState = getJamStateForRound(broadcast, 2);

    expect(directiveJamState!.musicalContext.energy).toBe(7);

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

    const drumsProc = getNthProcess(processes, 0);
    const bassProc = getNthProcess(processes, 1);
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

  it('routes directive to exactly one agent when target is alive', async () => {
    const { manager, broadcast, processes } = createTestManager();

    // Start with drums and bass
    const startPromise = manager.start(['drums', 'bass']);
    await vi.advanceTimersByTimeAsync(0);

    const drumsProc = getNthProcess(processes, 0);
    const bassProc = getNthProcess(processes, 1);
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
  });

  afterEach(async () => {
    vi.useRealTimers();
  });

  it('snapshot stays consistent with latest jam_state_update broadcast', async () => {
    const { manager, broadcast, processes } = createTestManager();

    const startPromise = manager.start(['drums', 'bass']);
    await vi.advanceTimersByTimeAsync(0);

    const drumsProc = getNthProcess(processes, 0);
    const bassProc = getNthProcess(processes, 1);

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
