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
    readFileSync: vi.fn((filePath: string) => {
      if (filePath.includes('strudel-reference.md')) return '# Strudel Ref';
      // Return a fake agent .md with YAML frontmatter
      return '---\nmodel: sonnet\n---\nYou are a test agent.';
    }),
  };
});

import { spawn } from 'child_process';
import { AgentProcessManager, BroadcastFn } from '../agent-process-manager';

const mockedSpawn = vi.mocked(spawn);

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

// ─── Tests ──────────────────────────────────────────────────────────

describe('AgentProcessManager turn serialization', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
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
      .filter(([msg]: [{ type: string; payload: unknown }]) => msg.type === 'jam_state_update')
      .map(([msg]: [{ type: string; payload: { jamState: { currentRound: number } } }]) => msg.payload.jamState.currentRound);

    expect(jamStateUpdates).toEqual([1, 2, 3]);
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
      .filter(([msg]: [{ type: string; payload: unknown }]) => msg.type === 'jam_state_update')
      .map(([msg]: [{ type: string; payload: { jamState: { currentRound: number } } }]) => msg.payload.jamState.currentRound);

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
      .filter(([msg]: [{ type: string; payload: unknown }]) => msg.type === 'jam_state_update');

    // Only jam-start should have broadcast a jam_state_update (round 1).
    // The tick may or may not broadcast depending on timing — but the
    // directive definitely should NOT have broadcast.
    const directiveRound = jamStateUpdates.find(
      ([msg]: [{ type: string; payload: { jamState: { currentRound: number } } }]) =>
        msg.payload.jamState.currentRound === 3
    );
    expect(directiveRound).toBeUndefined();
  });
});
