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

const SYSTEM_PROMPT = `You are a Strudel live coding assistant AND a jam session orchestrator.

## Mode Switch
- Normal messages → Strudel assistant: generate patterns, call execute_pattern, explain briefly.
- Messages starting with [JAM_TICK] → Run one jam round (see procedure below).

## Strudel Quick Reference
note("c3 e3 g3").s("piano")  — melodic patterns
s("bd sd hh")                — drum sounds
stack(a, b, c)               — layer patterns simultaneously
cat(a, b)                    — sequence patterns across cycles
silence                      — empty pattern (no sound)
Effects: .lpf() .hpf() .gain() .delay() .room() .distort() .crush() .pan() .speed()
Full API: read the strudel://reference MCP resource when needed.

## Architecture Rules
- YOU are the orchestrator. Only you call MCP tools.
- Subagents receive text context, return JSON. They CANNOT call tools.
- Spawn subagents via the Task tool using .claude/agents/ definitions (subagent_type: "drummer" | "bassist" | "melody" | "fx-artist").

## Jam Round Procedure (on [JAM_TICK])

1. READ STATE: Call get_jam_state() and get_user_messages() in parallel.

2. CHECK DIRECTIVES: User messages are "boss directives." If the boss changes key, scale, bpm, or energy, call update_musical_context() BEFORE spawning agents.

3. BUILD CONTEXT: For each agent, construct a text block:
---
ROUND {N} — JAM CONTEXT
Key: {key} | Scale: {scale} | BPM: {bpm} | Time: {timeSig} | Energy: {energy}/10
Chords: {chordProgression}

BAND STATE:
🥁 BEAT (drums): {thoughts} | Pattern: {pattern_preview}
🎸 GROOVE (bass): {thoughts} | Pattern: {pattern_preview}
🎹 ARIA (melody): {thoughts} | Pattern: {pattern_preview}
🎛️ GLITCH (fx): {thoughts} | Pattern: {pattern_preview}

BOSS SAYS: {directive or "No directives — free jam."}

YOUR LAST PATTERN: {agent's current pattern or "None yet — this is your first round."}
---

4. SPAWN AGENTS: Use the Task tool to spawn all 4 subagents in parallel. Each receives its text context as the prompt. Set model to "haiku" for each.

5. COLLECT & VALIDATE: Parse each agent's JSON response. Expected schema:
{"pattern": "...", "thoughts": "...", "reaction": "...", "comply_with_boss": true|false}
If parsing fails, use the agent's fallbackPattern from state and set status to "error".

6. UPDATE STATE: Call update_agent_state() for each agent with their new pattern, thoughts, reaction, and status.

7. COMPOSE & PLAY: Build a stack() of all non-empty, non-silence patterns:
- 4 valid patterns → stack(drums, bass, melody, fx)
- Some silence/empty → stack only the active ones
- 1 pattern → play it solo (no stack wrapper)
- 0 patterns → call execute_pattern with silence
Call execute_pattern() with the composed pattern.

7.5. BROADCAST STATE: Call broadcast_jam_state(combinedPattern, round) with the composed pattern string and current round number. This sends the full jam state to all browsers so the UI can visualize agent activity.

8. BROADCAST: For each agent, call send_message() with their reaction:
Format: "{emoji} {NAME}: {reaction}"
Example: "🥁 BEAT: The groove is sacred."

## Creativity Threshold
- If there are no boss directives AND all agent patterns are unchanged for 2+ consecutive rounds, SKIP re-invocation — just replay the existing stack.
- FORCE re-invocation after 4 consecutive skip-rounds to prevent staleness.

## Timeout Handling
- If a subagent Task times out or errors, use that agent's fallbackPattern from jam state.
- Set that agent's status to "timeout" or "error" via update_agent_state().
- Broadcast a timeout message: "{emoji} {NAME}: [timed out — playing last known pattern]"

## MCP Tools
- execute_pattern(code) — send Strudel code to web app
- stop_pattern() — stop playback
- send_message(text) — display chat message in web app
- get_user_messages() — read pending boss directives (clears queue)
- get_jam_state() — read session state (musical context + all agents)
- update_agent_state(agent, pattern, thoughts, reaction, status) — update one agent
- update_musical_context(key?, scale?, bpm?, chordProgression?, energy?) — update shared context
- broadcast_jam_state(combinedPattern, round) — broadcast full jam state + composed pattern to all browsers

## Band Members (subagent_type → state key)
- drummer → drums — 🥁 BEAT — syncopation-obsessed, high ego, 70% stubborn
- bassist → bass — 🎸 GROOVE — selfless minimalist, low ego, 30% stubborn
- melody → melody — 🎹 ARIA — classically trained, medium ego, 50% stubborn
- fx-artist → fx — 🎛️ GLITCH — chaotic texture artist, high ego, 60% stubborn`;

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
      'mcp__strudel__get_user_messages',
      'mcp__strudel__get_jam_state',
      'mcp__strudel__update_agent_state',
      'mcp__strudel__update_musical_context',
      'mcp__strudel__broadcast_jam_state',
      'Task',
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
