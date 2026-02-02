import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as readline from 'readline';
import * as path from 'path';

// Claude Code streaming JSON message types
export interface ClaudeMessage {
  type: 'assistant' | 'user' | 'system' | 'result';
  message?: AssistantMessage;
  content?: string;
  subtype?: string;
  tool_use_id?: string;
  duration_ms?: number;
  cost_usd?: number;
}

export interface AssistantMessage {
  id: string;
  type: 'message';
  role: 'assistant';
  content: ContentBlock[];
  model: string;
  stop_reason: string;
}

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

export interface ClaudeProcessOptions {
  workingDir?: string;
  onMessage?: (msg: ClaudeMessage) => void;
  onError?: (error: Error) => void;
  onExit?: (code: number | null) => void;
  onReady?: () => void;
}

const STRUDEL_SYSTEM_PROMPT = `You are a Strudel live coding assistant. When users ask for music, beats, or patterns:

1. Generate valid Strudel patterns using the Strudel API
2. Call execute_pattern to play them immediately
3. Briefly explain what you created

## Key Strudel Functions

### Sound Sources
- note("c3 e3 g3").sound("piano") - Play notes with instruments
- s("bd sd hh") - Shorthand for drum sounds
- sound("casio").n(0 1 2) - Use n() for sample variations

### Rhythm
- .slow(2) - Half speed
- .fast(2) - Double speed
- "<c3 e3 g3>/4" - Play sequence over 4 cycles

### Effects
- .lpf(800) - Low pass filter
- .hpf(400) - High pass filter
- .gain(0.8) - Volume
- .delay(0.5) - Echo effect
- .room(0.5) - Reverb

### Patterns
- .struct("t t t ~ t t ~ t") - Euclidean rhythms
- stack(pattern1, pattern2) - Layer patterns
- cat(pattern1, pattern2) - Sequence patterns

### Example Patterns

Funky beat:
stack(
  s("bd sd:1 bd sd:2").gain(0.9),
  s("hh*8").gain(0.5),
  note("<c2 [c2 g2] f2 g2>").s("sawtooth").lpf(400)
)

Ambient:
note("c3 e3 g3 b3").sound("sine").slow(2).room(0.8).delay(0.4)

Keep patterns concise. Respond conversationally but always demonstrate with executable code.`;

export class ClaudeProcess extends EventEmitter {
  private process: ChildProcess | null = null;
  private rl: readline.Interface | null = null;
  private workingDir: string;
  private options: ClaudeProcessOptions;
  private messageBuffer = '';
  private isReady = false;

  constructor(options: ClaudeProcessOptions = {}) {
    super();
    this.options = options;
    this.workingDir = options.workingDir || process.cwd();
  }

  async start(): Promise<void> {
    if (this.process) {
      throw new Error('Claude process already running');
    }

    const mcpConfigPath = path.join(this.workingDir, 'mcp-config.json');

    // Spawn Claude CLI with streaming JSON mode
    // --verbose is required when using --output-format=stream-json with --print
    console.log('[Claude] Starting process in:', this.workingDir);
    console.log('[Claude] MCP config:', mcpConfigPath);
    this.process = spawn('claude', [
      '--print',
      '--verbose',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--mcp-config', mcpConfigPath,
      '--system-prompt', STRUDEL_SYSTEM_PROMPT,
    ], {
      cwd: this.workingDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        // Disable interactive prompts
        CLAUDE_CODE_ENTRYPOINT: 'cli',
      },
    });

    console.log('[Claude] Process spawned, pid:', this.process.pid);

    // Create readline interface for line-by-line JSON parsing
    this.rl = readline.createInterface({
      input: this.process.stdout!,
      crlfDelay: Infinity,
    });

    this.rl.on('line', (line) => {
      this.handleLine(line);
    });

    this.process.stderr!.on('data', (data) => {
      const text = data.toString();
      console.error('[Claude stderr]:', text);
    });

    this.process.on('error', (error) => {
      console.error('[Claude process error]:', error);
      this.options.onError?.(error);
      this.emit('error', error);
    });

    this.process.on('exit', (code, signal) => {
      console.log('[Claude process exited]: code=', code, 'signal=', signal);
      this.cleanup();
      this.options.onExit?.(code);
      this.emit('exit', code);
    });

    // Mark as ready after short delay to allow process to initialize
    setTimeout(() => {
      this.isReady = true;
      this.options.onReady?.();
      this.emit('ready');
    }, 100);
  }

  private handleLine(line: string): void {
    if (!line.trim()) return;

    try {
      const message = JSON.parse(line) as ClaudeMessage;
      this.options.onMessage?.(message);
      this.emit('message', message);
    } catch {
      // Line might be incomplete or not JSON, buffer it
      this.messageBuffer += line;
      try {
        const message = JSON.parse(this.messageBuffer) as ClaudeMessage;
        this.messageBuffer = '';
        this.options.onMessage?.(message);
        this.emit('message', message);
      } catch {
        // Still incomplete, keep buffering
        if (this.messageBuffer.length > 100000) {
          // Clear buffer if it gets too large
          console.error('[Claude] Buffer overflow, clearing');
          this.messageBuffer = '';
        }
      }
    }
  }

  sendUserMessage(text: string): void {
    if (!this.process || !this.process.stdin) {
      throw new Error('Claude process not running');
    }

    // Claude CLI stream-json format requires message wrapper with role
    const userMessage = {
      type: 'user',
      message: {
        role: 'user',
        content: text,
      },
    };

    this.process.stdin.write(JSON.stringify(userMessage) + '\n');
  }

  isRunning(): boolean {
    return this.process !== null && !this.process.killed;
  }

  async stop(): Promise<void> {
    if (!this.process) return;

    const proc = this.process;
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        proc?.kill('SIGKILL');
        resolve();
      }, 5000);

      proc.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });

      proc.kill('SIGTERM');
    });
  }

  private cleanup(): void {
    this.rl?.close();
    this.rl = null;
    this.process = null;
    this.isReady = false;
    this.messageBuffer = '';
  }
}

// Singleton manager for the Claude process
let globalProcess: ClaudeProcess | null = null;

export function getClaudeProcess(): ClaudeProcess | null {
  return globalProcess;
}

export async function startClaudeProcess(options: ClaudeProcessOptions = {}): Promise<ClaudeProcess> {
  if (globalProcess?.isRunning()) {
    return globalProcess;
  }

  globalProcess = new ClaudeProcess(options);
  await globalProcess.start();
  return globalProcess;
}

export async function stopClaudeProcess(): Promise<void> {
  if (globalProcess) {
    await globalProcess.stop();
    globalProcess = null;
  }
}
