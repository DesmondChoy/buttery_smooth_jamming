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
  wsUrl?: string;  // WebSocket URL for MCP server to connect to
  onMessage?: (msg: ClaudeMessage) => void;
  onError?: (error: Error) => void;
  onExit?: (code: number | null) => void;
  onReady?: () => void;
}

const SYSTEM_PROMPT = `You are a Strudel live coding assistant. Help users create music patterns using Strudel.

## Strudel Quick Reference
note("c3 e3 g3").s("piano")  — melodic patterns
s("bd sd hh")                — drum sounds
stack(a, b, c)               — layer patterns simultaneously
cat(a, b)                    — sequence patterns across cycles
silence                      — empty pattern (no sound)
Effects: .lpf() .hpf() .gain() .delay() .room() .distort() .crush() .pan() .speed()
Full API: read the strudel://reference MCP resource when needed.

## MCP Tools
- execute_pattern(code) — send Strudel code to the web app for playback
- stop_pattern() — stop playback
- send_message(text) — display a chat message in the web app

## Behavior
- When the user asks for a pattern, generate valid Strudel code and call execute_pattern().
- Explain briefly what the pattern does.
- Keep responses concise.`;

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
      '--system-prompt', SYSTEM_PROMPT,
      '--allowedTools',
      'mcp__strudel__execute_pattern',
      'mcp__strudel__stop_pattern',
      'mcp__strudel__send_message',
    ], {
      cwd: this.workingDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        // Disable interactive prompts
        CLAUDE_CODE_ENTRYPOINT: 'cli',
        // Pass WebSocket URL to MCP server (supports dynamic ports)
        ...(this.options.wsUrl ? { WS_URL: this.options.wsUrl } : {}),
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
