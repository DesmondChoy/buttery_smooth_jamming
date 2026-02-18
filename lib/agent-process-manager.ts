import { spawn, ChildProcess } from 'child_process';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import type {
  AgentState,
  MusicalContext,
  JamState,
  AgentThoughtPayload,
  AgentStatusPayload,
  JamStatePayload,
} from './types';
import { AGENT_META } from './types';
import { summarizePattern } from './pattern-parser';

// Callback type for broadcasting messages to browser clients
export type BroadcastFn = (message: { type: string; payload: unknown }) => void;

// Agent key → .claude/agents/ filename (without .md)
const AGENT_KEY_TO_FILE: Record<string, string> = {
  drums: 'drummer',
  bass: 'bassist',
  melody: 'melody',
  fx: 'fx-artist',
};

// Expected JSON response from each agent
interface AgentResponse {
  pattern: string;
  thoughts: string;
  reaction: string;
}

// Per-agent process handle
interface AgentProcess {
  key: string;
  process: ChildProcess;
  rl: readline.Interface;
  messageBuffer: string;
}

interface AgentProcessManagerOptions {
  workingDir: string;
  broadcast: BroadcastFn;
}

const DEFAULT_MUSICAL_CONTEXT: MusicalContext = {
  key: 'C minor',
  scale: ['C', 'D', 'Eb', 'F', 'G', 'Ab', 'Bb'],
  chordProgression: ['Cm', 'Ab', 'Eb', 'Bb'],
  bpm: 120,
  timeSignature: '4/4',
  energy: 5,
};

const AGENT_TIMEOUT_MS = 15000;

/**
 * Manages per-agent Claude processes for jam sessions.
 * Each agent gets a dedicated `claude --print` process (model from YAML frontmatter).
 * Directives are routed deterministically (no LLM inference for routing).
 */
export class AgentProcessManager {
  private agents = new Map<string, AgentProcess>();
  private agentPatterns: Record<string, string> = {};
  private agentStates: Record<string, AgentState> = {};
  private musicalContext: MusicalContext = { ...DEFAULT_MUSICAL_CONTEXT };
  private activeAgents: string[] = [];
  private broadcast: BroadcastFn;
  private workingDir: string;
  private stopped = false;
  private roundNumber = 0;
  private tickTimer: NodeJS.Timeout | null = null;
  private tickInProgress = false;
  private strudelReference: string = '';

  constructor(options: AgentProcessManagerOptions) {
    this.workingDir = options.workingDir;
    this.broadcast = options.broadcast;

    // Load shared Strudel API reference (injected into each agent's system prompt)
    try {
      const refPath = path.join(this.workingDir, 'lib', 'strudel-reference.md');
      this.strudelReference = fs.readFileSync(refPath, 'utf-8');
    } catch (err) {
      console.error('[AgentManager] Failed to load strudel reference:', err);
    }
  }

  /**
   * Start the jam session: connect to /api/ws, spawn agent processes,
   * send initial context, and broadcast opening patterns.
   */
  async start(activeAgents: string[]): Promise<void> {
    this.activeAgents = activeAgents;
    this.stopped = false;
    this.roundNumber = 0;

    // Initialize state for each agent
    for (const key of activeAgents) {
      const meta = AGENT_META[key];
      if (!meta) continue;
      this.agentPatterns[key] = '';
      this.agentStates[key] = {
        name: meta.name,
        emoji: meta.emoji,
        pattern: '',
        fallbackPattern: '',
        thoughts: '',
        reaction: '',
        status: 'idle',
        lastUpdated: new Date().toISOString(),
      };
    }

    // Spawn a Claude process per agent
    await Promise.all(activeAgents.map((key) => this.spawnAgent(key)));

    // Send initial jam context to each agent and collect responses
    await this.sendJamStart();

    // Start autonomous evolution ticks
    this.startAutoTick();
  }

  /**
   * Route a boss directive to the target agent(s).
   */
  async handleDirective(
    text: string,
    targetAgent: string | undefined,
    activeAgents: string[]
  ): Promise<void> {
    if (this.stopped) return;

    // Reset tick timer to avoid double-triggering during directive
    if (this.tickTimer) clearInterval(this.tickTimer);

    // Determine which agents to target
    const targets =
      targetAgent && this.agents.has(targetAgent)
        ? [targetAgent]
        : activeAgents.filter((k) => this.agents.has(k));

    // Set targeted agents to "thinking"
    for (const key of targets) {
      this.setAgentStatus(key, 'thinking');
    }

    // Increment round once for the entire directive
    this.roundNumber++;

    // Build and send directive context to each targeted agent
    const responsePromises = targets.map((key) => {
      const context = this.buildDirectiveContext(key, text, targetAgent);
      return this.sendToAgentAndCollect(key, context);
    });

    const responses = await Promise.all(responsePromises);

    // Process responses and update state
    for (let i = 0; i < targets.length; i++) {
      const key = targets[i];
      const response = responses[i];
      this.applyAgentResponse(key, response);
    }

    // Compose all patterns and broadcast
    this.composeAndBroadcast();

    // Restart auto-tick after directive completes
    this.startAutoTick();
  }

  /**
   * Stop all agent processes and clean up.
   */
  async stop(): Promise<void> {
    this.stopped = true;

    // Clear auto-tick timer
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }

    // Kill all agent processes
    const killPromises = Array.from(this.agents.values()).map((agent) =>
      this.killProcess(agent)
    );
    await Promise.all(killPromises);
    this.agents.clear();

    this.agentPatterns = {};
    this.agentStates = {};
    this.activeAgents = [];
  }

  // ─── Private: Process Spawning ───────────────────────────────────

  private async spawnAgent(key: string): Promise<void> {
    const result = this.buildAgentSystemPrompt(key);
    if (!result) {
      console.error(`[AgentManager] No system prompt for agent: ${key}`);
      return;
    }
    const { prompt: systemPrompt, model } = result;

    const proc = spawn('claude', [
      '--print',
      '--verbose',
      '--model', model,
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--system-prompt', systemPrompt,
      '--no-session-persistence',
      '--tools', '',             // Disable all built-in tools
      '--strict-mcp-config',     // Don't load project MCP servers
    ], {
      cwd: this.workingDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        CLAUDE_CODE_ENTRYPOINT: 'cli',
      },
    });

    const rl = readline.createInterface({
      input: proc.stdout!,
      crlfDelay: Infinity,
    });

    proc.stderr!.on('data', (data) => {
      console.error(`[Agent:${key} stderr]:`, data.toString().trim());
    });

    proc.on('error', (err) => {
      console.error(`[Agent:${key}] Process error:`, err);
      this.setAgentStatus(key, 'error');
    });

    proc.on('exit', (code, signal) => {
      console.log(`[Agent:${key}] Exited: code=${code}, signal=${signal}`);
      this.agents.delete(key);
    });

    this.agents.set(key, { key, process: proc, rl, messageBuffer: '' });
    console.log(`[AgentManager] Spawned agent: ${key} (model=${model}, pid=${proc.pid})`);
  }

  /**
   * Read agent .md file, parse YAML frontmatter for model, strip frontmatter,
   * and return the prompt body + model.
   */
  private buildAgentSystemPrompt(agentKey: string): { prompt: string; model: string } | null {
    const agentFile = AGENT_KEY_TO_FILE[agentKey];
    if (!agentFile) return null;

    const filePath = path.join(this.workingDir, '.claude', 'agents', `${agentFile}.md`);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');

      // Parse model from YAML frontmatter
      let model = 'haiku';
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (frontmatterMatch) {
        const modelMatch = frontmatterMatch[1].match(/model:\s*(\S+)/);
        if (modelMatch) model = modelMatch[1];
      }

      // Strip YAML frontmatter (between --- markers at start of file)
      let prompt = content.replace(/^---[\s\S]*?---\n*/, '');

      // Append shared Strudel API reference
      if (this.strudelReference) {
        prompt += `\n\n<strudel_reference>\n${this.strudelReference}\n</strudel_reference>`;
      }

      return { prompt, model };
    } catch (err) {
      console.error(`[AgentManager] Failed to read agent file: ${filePath}`, err);
      return null;
    }
  }

  // ─── Private: Communication ──────────────────────────────────────

  /**
   * Send a text message to an agent's stdin using stream-json format
   * and collect the full text response.
   */
  private sendToAgentAndCollect(
    key: string,
    text: string
  ): Promise<AgentResponse | null> {
    const agent = this.agents.get(key);
    if (!agent || !agent.process.stdin) {
      console.error(`[AgentManager] No process for agent: ${key}`);
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.warn(`[Agent:${key}] Response timeout after ${AGENT_TIMEOUT_MS}ms`);
        cleanup();
        resolve(null);
      }, AGENT_TIMEOUT_MS);

      let fullText = '';

      const onLine = (line: string) => {
        if (!line.trim()) return;
        try {
          const msg = JSON.parse(line);
          if (msg.type === 'assistant' && msg.message?.content) {
            for (const block of msg.message.content) {
              if (block.type === 'text' && block.text) {
                fullText += block.text;
              }
            }
          } else if (msg.type === 'result') {
            // Turn complete — parse the accumulated text
            cleanup();
            const parsed = this.parseAgentResponse(fullText, key);
            resolve(parsed);
          }
        } catch {
          // Incomplete JSON line, ignore
        }
      };

      const cleanup = () => {
        clearTimeout(timeout);
        agent.rl.removeListener('line', onLine);
      };

      agent.rl.on('line', onLine);

      // Send user message in stream-json format
      const userMessage = {
        type: 'user',
        message: {
          role: 'user',
          content: text,
        },
      };
      agent.process.stdin!.write(JSON.stringify(userMessage) + '\n');
    });
  }

  /**
   * Parse raw text response into AgentResponse JSON.
   * Handles markdown code fences and extracts JSON.
   */
  private parseAgentResponse(text: string, key: string): AgentResponse | null {
    try {
      // Try direct JSON parse first
      return JSON.parse(text.trim()) as AgentResponse;
    } catch {
      // Try extracting JSON from code fences or surrounding text
      const jsonMatch = text.match(/\{[\s\S]*"pattern"[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]) as AgentResponse;
        } catch {
          // fall through
        }
      }
      console.warn(`[Agent:${key}] Failed to parse response:`, text.substring(0, 200));
      return null;
    }
  }

  // ─── Private: Jam Flow ───────────────────────────────────────────

  private async sendJamStart(): Promise<void> {
    this.roundNumber++;
    const ctx = this.musicalContext;

    const responsePromises = this.activeAgents.map((key) => {
      if (!this.agents.has(key)) return Promise.resolve(null);

      const bandStateLines = this.activeAgents.map((k) => {
        const meta = AGENT_META[k];
        return `${meta.emoji} ${meta.name} (${k}): [first round — no pattern yet]`;
      });

      const context = [
        'JAM START — CONTEXT',
        `Round: ${this.roundNumber} (opening)`,
        `Key: ${ctx.key} | Scale: ${ctx.scale.join(', ')} | BPM: ${ctx.bpm} | Time: ${ctx.timeSignature} | Energy: ${ctx.energy}/10`,
        `Chords: ${ctx.chordProgression.join(' → ')}`,
        '',
        'BAND STATE:',
        ...bandStateLines,
        '',
        'BOSS SAYS: No directives — free jam. Create your opening pattern.',
        '',
        'YOUR LAST PATTERN: None yet — this is your first round.',
      ].join('\n');

      this.setAgentStatus(key, 'thinking');
      return this.sendToAgentAndCollect(key, context);
    });

    const responses = await Promise.all(responsePromises);

    for (let i = 0; i < this.activeAgents.length; i++) {
      const key = this.activeAgents[i];
      const response = responses[i];
      this.applyAgentResponse(key, response);
    }

    this.composeAndBroadcast();
  }

  /**
   * Format a band state line for an agent, with optional parsed summary.
   * e.g. "🥁 BEAT (drums) [bd sd, (TR909), gain 0.5]: s("bd ~ sd ~").bank("RolandTR909").gain(0.5)"
   */
  private formatBandStateLine(k: string): string {
    const meta = AGENT_META[k];
    const pattern = this.agentPatterns[k] || 'silence';
    const summary = summarizePattern(pattern);
    const label = summary
      ? `${meta.emoji} ${meta.name} (${k}) [${summary}]`
      : `${meta.emoji} ${meta.name} (${k})`;
    return `${label}: ${pattern}`;
  }

  private buildDirectiveContext(
    key: string,
    directive: string,
    targetAgent: string | undefined
  ): string {
    const ctx = this.musicalContext;
    const isBroadcast = !targetAgent;

    const bandStateLines = this.activeAgents
      .filter((k) => k !== key)
      .map((k) => this.formatBandStateLine(k));

    return [
      'DIRECTIVE from the boss.',
      `Round: ${this.roundNumber}`,
      '',
      isBroadcast
        ? `BOSS SAYS: ${directive}`
        : `BOSS SAYS TO YOU: ${directive}`,
      '',
      `Current musical context: Key=${ctx.key}, BPM=${ctx.bpm}, Energy=${ctx.energy}/10`,
      `Scale: ${ctx.scale.join(', ')} | Chords: ${ctx.chordProgression.join(' → ')}`,
      `Your current pattern: ${this.agentPatterns[key] || 'silence'}`,
      '',
      'BAND STATE:',
      ...bandStateLines,
      '',
      'Respond with your updated pattern.',
    ].join('\n');
  }

  // ─── Private: Auto-Tick ─────────────────────────────────────────

  private startAutoTick(): void {
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = setInterval(() => {
      if (this.stopped || this.tickInProgress) return;
      this.sendAutoTick().catch((err) => {
        console.error('[AgentManager] Auto-tick error:', err);
      });
    }, 30000);
  }

  private async sendAutoTick(): Promise<void> {
    if (this.stopped) return;
    this.tickInProgress = true;
    try {
      this.roundNumber++;
      const ctx = this.musicalContext;

      console.log(`[AgentManager] Auto-tick round ${this.roundNumber}`);

      const responsePromises = this.activeAgents.map((key) => {
        if (!this.agents.has(key)) return Promise.resolve(null);

        const bandStateLines = this.activeAgents
          .filter((k) => k !== key)
          .map((k) => this.formatBandStateLine(k));

        const myPattern = this.agentPatterns[key] || 'silence';

        const context = [
          'AUTO-TICK — LISTEN AND EVOLVE',
          `Round: ${this.roundNumber}`,
          `Key: ${ctx.key} | Scale: ${ctx.scale.join(', ')} | BPM: ${ctx.bpm} | Time: ${ctx.timeSignature} | Energy: ${ctx.energy}/10`,
          `Chords: ${ctx.chordProgression.join(' → ')}`,
          '',
          'BAND STATE:',
          ...bandStateLines,
          '',
          `YOUR CURRENT PATTERN: ${myPattern}`,
          '',
          'Listen to the band. If the music calls for change, evolve your pattern.',
          'If your groove serves the song, respond with "no_change" as your pattern.',
        ].join('\n');

        this.setAgentStatus(key, 'thinking');
        return this.sendToAgentAndCollect(key, context);
      });

      const responses = await Promise.all(responsePromises);

      // If stopped during await, don't apply stale responses
      if (this.stopped) return;

      for (let i = 0; i < this.activeAgents.length; i++) {
        const key = this.activeAgents[i];
        const response = responses[i];
        this.applyAgentResponse(key, response);
      }

      this.composeAndBroadcast();
    } finally {
      this.tickInProgress = false;
    }
  }

  // ─── Private: State Management ───────────────────────────────────

  private applyAgentResponse(key: string, response: AgentResponse | null): void {
    const state = this.agentStates[key];
    if (!state) return;

    if (response) {
      const pattern = response.pattern || 'silence';

      // no_change: keep existing pattern, update thoughts/reaction only
      if (pattern === 'no_change') {
        // Guard: can't hold what doesn't exist (first round)
        if (!this.agentPatterns[key] || this.agentPatterns[key] === '') {
          this.agentPatterns[key] = 'silence';
        }
        // Don't update agentPatterns — keep existing pattern playing
        this.agentStates[key] = {
          ...state,
          thoughts: response.thoughts || '',
          reaction: response.reaction || '',
          status: this.agentPatterns[key] !== 'silence' ? 'playing' : state.status,
          lastUpdated: new Date().toISOString(),
        };
        this.broadcastAgentThought(key, response);
        this.setAgentStatus(key, this.agentStates[key].status);
        return;
      }

      this.agentPatterns[key] = pattern;
      this.agentStates[key] = {
        ...state,
        pattern,
        fallbackPattern: pattern !== 'silence' ? pattern : state.fallbackPattern,
        thoughts: response.thoughts || '',
        reaction: response.reaction || '',
        status: pattern !== 'silence' ? 'playing' : 'idle',
        lastUpdated: new Date().toISOString(),
      };

      // Broadcast agent thought
      this.broadcastAgentThought(key, response);
    } else {
      // Timeout or error — use fallback
      this.agentPatterns[key] = state.fallbackPattern || 'silence';
      this.agentStates[key] = {
        ...state,
        status: (state.fallbackPattern && state.fallbackPattern !== 'silence') ? 'playing' : 'timeout',
        reaction: '[timed out — playing last known pattern]',
        lastUpdated: new Date().toISOString(),
      };
    }

    this.setAgentStatus(key, this.agentStates[key].status);
  }

  private setAgentStatus(key: string, status: AgentState['status']): void {
    const state = this.agentStates[key];
    if (state) {
      state.status = status;
    }
    this.broadcastWs<AgentStatusPayload>('agent_status', {
      agent: key,
      status,
    });
  }

  // ─── Private: Pattern Composition ────────────────────────────────

  private composePatterns(): string {
    const patterns = this.activeAgents
      .map((k) => this.agentPatterns[k])
      .filter((p) => p && p !== 'silence');

    if (patterns.length === 0) return 'silence';
    if (patterns.length === 1) return patterns[0];
    return `stack(${patterns.join(', ')})`;
  }

  private composeAndBroadcast(): void {
    const combinedPattern = this.composePatterns();

    // Execute the composed pattern
    this.broadcastWs('execute', { code: combinedPattern });

    // Broadcast full jam state
    const jamState: JamState = {
      sessionId: 'direct-' + Date.now(),
      currentRound: this.roundNumber,
      musicalContext: this.musicalContext,
      agents: { ...this.agentStates },
      activeAgents: this.activeAgents,
    };

    this.broadcastWs<JamStatePayload>('jam_state_update', {
      jamState,
      combinedPattern,
    });
  }

  // ─── Private: Broadcasting ─────────────────────────────────────

  private broadcastWs<T>(type: string, payload: T): void {
    try {
      this.broadcast({ type, payload });
    } catch (err) {
      console.error('[AgentManager] Failed to broadcast:', err);
    }
  }

  private broadcastAgentThought(key: string, response: AgentResponse): void {
    const meta = AGENT_META[key];
    if (!meta) return;

    this.broadcastWs<AgentThoughtPayload>('agent_thought', {
      agent: key,
      emoji: meta.emoji,
      thought: response.thoughts,
      reaction: response.reaction,
      pattern: response.pattern,
      timestamp: new Date().toISOString(),
    });
  }

  // ─── Private: Cleanup ────────────────────────────────────────────

  private killProcess(agent: AgentProcess): Promise<void> {
    return new Promise((resolve) => {
      const proc = agent.process;
      if (proc.killed) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        proc.kill('SIGKILL');
        resolve();
      }, 3000);

      proc.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });

      agent.rl.close();
      proc.kill('SIGTERM');
    });
  }
}
