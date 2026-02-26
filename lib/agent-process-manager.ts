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
  StructuredMusicalDecision,
  DecisionConfidence,
  ArrangementIntent,
} from './types';
import { AGENT_META } from './types';
import { formatBandStateLine } from './pattern-parser';
import {
  detectRelativeMusicalContextCues,
  parseDeterministicMusicalContextChanges,
} from './musical-context-parser';
import { randomMusicalContext } from './musical-context-presets';
import { map_codex_event_to_runtime_events } from './codex-process';
import {
  assert_codex_runtime_ready,
  build_codex_overrides,
  CODEX_JAM_PROFILE,
  load_project_codex_config,
} from './codex-runtime-checks';
import { SHARED_JAM_POLICY_PROMPT } from './jam-agent-shared-policy';
import { buildGenreEnergySection } from './genre-energy-guidance';

// Callback type for broadcasting messages to browser clients
export type BroadcastFn = (message: { type: string; payload: unknown }) => void;

// Agent key → agent persona filename (without .md)
const AGENT_KEY_TO_FILE: Record<string, string> = {
  drums: 'drummer',
  bass: 'bassist',
  melody: 'melody',
  fx: 'fx-artist',
};

// Canonical Codex path for jam agent persona prompts.
const AGENT_PROMPT_DIR_CANDIDATES = [
  ['.codex', 'agents'],
] as const;

// Expected JSON response from each agent
interface AgentResponse {
  pattern: string;
  thoughts: string;
  reaction: string;
  decision?: StructuredMusicalDecision;
}

// Per-agent Codex-backed session handle
interface AgentProcess {
  key: string;
  systemPrompt: string;
  model: string;
  threadId: string | null;
  activeTurn: ChildProcess | null;
  activeTurnRl: readline.Interface | null;
}

interface AgentProcessManagerOptions {
  workingDir: string;
  broadcast: BroadcastFn;
}

const AGENT_TIMEOUT_MS = 15000;
const JAM_TOOLLESS_ARGS = ['--tools', '', '--strict-mcp-config'] as const;
const ARRANGEMENT_INTENT_MAP: Record<string, ArrangementIntent> = {
  build: 'build',
  breakdown: 'breakdown',
  drop: 'drop',
  'strip back': 'strip_back',
  'strip-back': 'strip_back',
  strip_back: 'strip_back',
  'bring forward': 'bring_forward',
  'bring-forward': 'bring_forward',
  bring_forward: 'bring_forward',
  hold: 'hold',
  'no change': 'no_change',
  'no-change': 'no_change',
  no_change: 'no_change',
  transition: 'transition',
};
const DECISION_CONFIDENCE_SET = new Set<DecisionConfidence>(['low', 'medium', 'high']);
const DECISION_CONFIDENCE_MULTIPLIER: Record<DecisionConfidence, number> = {
  low: 0,
  medium: 0.5,
  high: 1,
};
type RelativeCueDirection = ReturnType<typeof detectRelativeMusicalContextCues>['tempo'];

/**
 * Manages per-agent Codex-backed sessions for jam mode.
 * Each agent keeps an isolated, resumable Codex session (`thread_id`) across turns.
 * Directives are routed deterministically (no LLM inference for routing).
 */
export class AgentProcessManager {
  private agents = new Map<string, AgentProcess>();
  private agentPatterns: Record<string, string> = {};
  private agentStates: Record<string, AgentState> = {};
  private agentDecisions: Record<string, StructuredMusicalDecision | undefined> = {};
  private musicalContext: MusicalContext = randomMusicalContext();
  private activeAgents: string[] = [];
  private broadcast: BroadcastFn;
  private workingDir: string;
  private stopped = false;
  private roundNumber = 0;
  private tickTimer: NodeJS.Timeout | null = null;
  private tickScheduled = false;
  private turnInProgress: Promise<void> = Promise.resolve();
  private turnCounter = 0;
  private strudelReference: string = '';
  private sessionId = 'direct-0';
  private codexConfigOverrides: string[] = [];
  private codexJamDefaultModel = 'gpt-5-codex-mini';

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
   * Serialize all turns (ticks, directives, jam start) through a single
   * Promise chain. Prevents two turns from overlapping on the same agent's
   * readline, which would cause response misattribution.
   */
  private enqueueTurn(label: string, fn: () => Promise<void>): Promise<void> {
    const turnId = ++this.turnCounter;
    const previous = this.turnInProgress;
    const current = previous.then(
      () => {
        console.log(`[AgentManager] Turn #${turnId} starting: ${label}`);
        return fn();
      },
      () => {
        console.log(`[AgentManager] Turn #${turnId} starting: ${label} (prev errored)`);
        return fn();
      }
    ).then(
      () => console.log(`[AgentManager] Turn #${turnId} completed: ${label}`),
      (err) => {
        console.error(`[AgentManager] Turn #${turnId} failed: ${label}`, err);
        throw err;
      }
    );
    // Always-resolving version so the chain never gets stuck
    this.turnInProgress = current.then(() => {}, () => {});
    return current;
  }

  /**
   * Start the jam session: connect to /api/ws, spawn agent processes,
   * send initial context, and broadcast opening patterns.
   */
  async start(activeAgents: string[]): Promise<void> {
    await assert_codex_runtime_ready({
      working_dir: this.workingDir,
    });
    const codexConfig = load_project_codex_config(this.workingDir);
    this.codexConfigOverrides = build_codex_overrides(codexConfig, CODEX_JAM_PROFILE);
    this.codexJamDefaultModel = codexConfig.jam_agent_model;

    this.activeAgents = activeAgents;
    this.stopped = false;
    this.roundNumber = 0;
    this.tickScheduled = false;
    this.sessionId = 'direct-' + Date.now();
    this.musicalContext = randomMusicalContext();
    this.agentDecisions = {};

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
      this.agentDecisions[key] = undefined;
    }

    // Prepare one Codex-backed session per agent
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
    return this.enqueueTurn('directive', async () => {
      if (this.stopped) return;

      // Reset tick timer to avoid double-triggering during directive
      if (this.tickTimer) clearInterval(this.tickTimer);

      // Guard: if a specific agent was targeted but is unavailable, error early
      if (targetAgent && !this.agents.has(targetAgent)) {
        const meta = AGENT_META[targetAgent];
        const name = meta?.name ?? targetAgent;
        const reason = !activeAgents.includes(targetAgent)
          ? `${name} is not in this jam session`
          : `${name}'s process is unavailable`;
        console.warn(`[AgentManager] Directive target unavailable: ${reason}`);
        this.broadcastWs('directive_error', { message: reason, targetAgent });
        this.startAutoTick();
        return;
      }

      // Apply deterministic anchors first (explicit BPM / half/double-time / explicit energy / key).
      // Relative tempo/energy cues are handled after agent responses using model decisions.
      const deterministicContextDelta = parseDeterministicMusicalContextChanges(
        text,
        this.musicalContext
      );
      const relativeContextCues = detectRelativeMusicalContextCues(text);
      if (deterministicContextDelta) {
        this.musicalContext = { ...this.musicalContext, ...deterministicContextDelta };
        console.log('[AgentManager] Deterministic musical context updated:', deterministicContextDelta);
      }

      // Determine which agents to target
      const targets = targetAgent
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

      const modelRelativeContextDelta = this.applyModelRelativeContextDeltaForDirectiveTurn({
        responses,
        deterministicContextDelta,
        relativeContextCues,
      });
      if (modelRelativeContextDelta) {
        console.log('[AgentManager] Model-relative musical context updated:', modelRelativeContextDelta);
      }

      // Compose all patterns and broadcast
      this.composeAndBroadcast();

      // Restart auto-tick after directive completes
      this.startAutoTick();
    });
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

    // Wait for any in-flight turn to finish before killing processes
    await this.turnInProgress.catch(() => {});

    // Hard-stop guarantee: no interval may survive shutdown.
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    this.tickScheduled = false;

    // Kill all active agent turns
    const killPromises = Array.from(this.agents.values()).map((agent) =>
      this.killProcess(agent)
    );
    await Promise.all(killPromises);
    this.agents.clear();

    this.agentPatterns = {};
    this.agentStates = {};
    this.agentDecisions = {};
    this.activeAgents = [];
    this.sessionId = 'direct-0';
    this.turnInProgress = Promise.resolve();
    this.turnCounter = 0;
    this.codexConfigOverrides = [];
  }

  /**
   * Snapshot of the manager-owned jam state (v2 jam-mode canonical source).
   */
  getJamStateSnapshot(): JamState {
    const agents: Record<string, AgentState> = {};
    for (const [key, state] of Object.entries(this.agentStates)) {
      agents[key] = { ...state };
    }

    return {
      sessionId: this.sessionId,
      currentRound: this.roundNumber,
      musicalContext: {
        ...this.musicalContext,
        scale: [...this.musicalContext.scale],
        chordProgression: [...this.musicalContext.chordProgression],
      },
      agents,
      activeAgents: [...this.activeAgents],
    };
  }

  // ─── Private: Session Setup ─────────────────────────────────────

  private async spawnAgent(key: string): Promise<void> {
    const result = this.buildAgentSystemPrompt(key);
    if (!result) {
      console.error(`[AgentManager] No system prompt for agent: ${key}`);
      return;
    }
    const { prompt: systemPrompt, model } = result;

    this.agents.set(key, {
      key,
      systemPrompt,
      model,
      threadId: null,
      activeTurn: null,
      activeTurnRl: null,
    });
    console.log(
      `[AgentManager] Prepared Codex jam session for ${key} ` +
      `(profile=${CODEX_JAM_PROFILE}, model=${model})`
    );
  }

  private resolveAgentPromptPath(agentFile: string): string | null {
    for (const segments of AGENT_PROMPT_DIR_CANDIDATES) {
      const candidate = path.join(this.workingDir, ...segments, `${agentFile}.md`);
      if (fs.existsSync(candidate)) return candidate;
    }
    return null;
  }

  /**
   * Read agent .md file, parse YAML frontmatter for model, strip frontmatter,
   * and return the prompt body + model. Non-Codex models in frontmatter are
   * ignored in favor of the configured jam_agent profile default.
   */
  private buildAgentSystemPrompt(agentKey: string): { prompt: string; model: string } | null {
    const agentFile = AGENT_KEY_TO_FILE[agentKey];
    if (!agentFile) return null;

    const filePath = this.resolveAgentPromptPath(agentFile);
    if (!filePath) {
      console.error(
        `[AgentManager] Agent file not found for key "${agentKey}". Tried: ` +
        AGENT_PROMPT_DIR_CANDIDATES
          .map((segments) => path.join(this.workingDir, ...segments, `${agentFile}.md`))
          .join(', ')
      );
      return null;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');

      // Parse optional Codex model override from YAML frontmatter
      let modelOverride: string | null = null;
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (frontmatterMatch) {
        const modelMatch = frontmatterMatch[1].match(/model:\s*(\S+)/);
        if (modelMatch && modelMatch[1].toLowerCase().startsWith('gpt-')) {
          modelOverride = modelMatch[1];
        }
      }

      // Strip YAML frontmatter (between --- markers at start of file)
      const personaPrompt = content.replace(/^---[\s\S]*?---\n*/, '');

      const promptParts = [
        '<agent_persona>',
        personaPrompt,
        '</agent_persona>',
      ];

      if (SHARED_JAM_POLICY_PROMPT) {
        promptParts.push(
          '',
          '<shared_policy>',
          SHARED_JAM_POLICY_PROMPT,
          '</shared_policy>'
        );
      }

      const genre = this.musicalContext.genre;
      if (genre) {
        const genreSection = buildGenreEnergySection(this.workingDir, genre, agentKey);
        if (genreSection) {
          promptParts.push('', genreSection);
        }
      }

      // Append shared Strudel API reference
      if (this.strudelReference) {
        promptParts.push(
          '',
          '<strudel_reference>',
          this.strudelReference,
          '</strudel_reference>'
        );
      }

      return {
        prompt: promptParts.join('\n'),
        model: modelOverride ?? this.codexJamDefaultModel,
      };
    } catch (err) {
      console.error(`[AgentManager] Failed to read agent file: ${filePath}`, err);
      return null;
    }
  }

  private buildCodexTurnArgs(agent: AgentProcess): string[] {
    const args = agent.threadId
      ? ['exec', 'resume', '--json', '--skip-git-repo-check', ...JAM_TOOLLESS_ARGS]
      : [
        'exec',
        '--json',
        '--profile',
        CODEX_JAM_PROFILE,
        '--skip-git-repo-check',
        '--color',
        'never',
        ...JAM_TOOLLESS_ARGS,
      ];

    if (agent.model) {
      args.push('--model', agent.model);
    }

    for (const override of this.codexConfigOverrides) {
      args.push('-c', override);
    }
    args.push('-c', 'features.runtime_metrics=false');

    if (agent.threadId) {
      args.push(agent.threadId, '-');
    } else {
      args.push('-');
    }

    return args;
  }

  private buildAgentTurnPrompt(agent: AgentProcess, text: string): string {
    return [
      agent.systemPrompt,
      '',
      '<manager_turn>',
      text,
      '</manager_turn>',
      '',
      'Output only one JSON object.',
      'Required keys: pattern, thoughts, reaction.',
      'Optional key: decision (tempo_delta_pct, energy_delta, arrangement_intent, confidence).',
      'Use decision only when relevant; omit decision or any field when not relevant or not confident.',
      'tempo_delta_pct is relative percent vs current BPM (positive=faster, negative=slower).',
      'energy_delta is relative energy steps (positive=more energy, negative=less energy).',
    ].join('\n');
  }

  // ─── Private: Communication ──────────────────────────────────────

  /**
   * Send one manager turn to a Codex-backed session and collect response text.
   * Supports both Codex JSONL events and legacy stream-json fixtures used by tests.
   */
  private sendToAgentAndCollect(
    key: string,
    text: string
  ): Promise<AgentResponse | null> {
    const agent = this.agents.get(key);
    if (!agent) {
      console.error(`[AgentManager] No process for agent: ${key}`);
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      const args = this.buildCodexTurnArgs(agent);
      const proc = spawn('codex', args, {
        cwd: this.workingDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          JAM_AGENT_KEY: key,
        },
      });
      const rl = readline.createInterface({
        input: proc.stdout!,
        crlfDelay: Infinity,
      });
      agent.activeTurn = proc;
      agent.activeTurnRl = rl;

      const timeout = setTimeout(() => {
        console.warn(`[Agent:${key}] Response timeout after ${AGENT_TIMEOUT_MS}ms`);
        if (!proc.killed) {
          proc.kill('SIGTERM');
        }
        finish();
      }, AGENT_TIMEOUT_MS);

      let fullText = '';
      let settled = false;
      let parseState = { saw_assistant_delta: false };
      let lastCodexError: string | null = null;

      const onLine = (line: string) => {
        if (!line.trim()) return;
        try {
          const msg = JSON.parse(line) as Record<string, unknown>;
          const legacyMessage = msg.message as {
            content?: Array<{ type?: string; text?: string }>;
          } | undefined;

          // Backward-compatible stream-json handling (used heavily in tests).
          if (msg.type === 'assistant' && legacyMessage?.content) {
            const content = legacyMessage.content;
            for (const block of content) {
              if (block.type === 'text' && block.text) {
                fullText += block.text;
              }
            }
            return;
          } else if (msg.type === 'result') {
            finish();
            return;
          }

          if (msg.type === 'thread.started' && typeof msg.thread_id === 'string') {
            agent.threadId = msg.thread_id;
          }

          const mapped = map_codex_event_to_runtime_events(msg, parseState);
          parseState = mapped.next_state;
          for (const event of mapped.events) {
            if (event.type === 'text') {
              fullText += event.text;
            } else if (event.type === 'error') {
              const formatted = this.formatCodexErrorForLog(event.error);
              if (formatted !== lastCodexError) {
                console.error(`[Agent:${key}] Codex turn failed: ${formatted}`);
              }
              lastCodexError = formatted;
            }
          }
          if (mapped.turn_completed) {
            finish();
          }
        } catch {
          // Non-JSON line (or partial line) — ignore.
        }
      };

      const cleanup = () => {
        clearTimeout(timeout);
        rl.removeListener('line', onLine);
        rl.close();
        agent.activeTurn = null;
        agent.activeTurnRl = null;
      };

      const finish = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(this.parseAgentResponse(fullText, key));
      };

      rl.on('line', onLine);

      proc.stderr?.on('data', (data) => {
        const text = data.toString().trim();
        if (!text) return;
        console.error(`[Agent:${key} stderr]:`, text);
      });

      proc.on('error', (err) => {
        console.error(`[Agent:${key}] Process error:`, err);
        this.setAgentStatus(key, 'error');
      });

      proc.on('exit', (code, signal) => {
        console.log(`[Agent:${key}] Turn exited: code=${code}, signal=${signal}`);
        if (typeof code === 'number' && code !== 0) {
          if (lastCodexError) {
            console.warn(
              `[Agent:${key}] Session became unavailable after non-zero exit (${code}). ` +
              `Last Codex error: ${lastCodexError}`
            );
          } else {
            console.warn(`[Agent:${key}] Session became unavailable after non-zero exit (${code})`);
          }
          this.agents.delete(key);
          this.setAgentStatus(key, 'error');
        }
        finish();
      });

      const prompt = this.buildAgentTurnPrompt(agent, text);
      proc.stdin?.write(prompt);
      proc.stdin?.write('\n');
      proc.stdin?.end();
    });
  }

  private validateAgentResponseShape(value: unknown, key: string): AgentResponse | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      console.warn(`[Agent:${key}] Invalid response schema (not object)`);
      return null;
    }

    const parsed = value as Record<string, unknown>;
    if (
      typeof parsed.pattern !== 'string'
      || typeof parsed.thoughts !== 'string'
      || typeof parsed.reaction !== 'string'
    ) {
      console.warn(`[Agent:${key}] Invalid response schema (missing pattern/thoughts/reaction strings)`);
      return null;
    }

    return {
      pattern: parsed.pattern,
      thoughts: parsed.thoughts,
      reaction: parsed.reaction,
      decision: this.normalizeDecisionBlock(parsed.decision),
    };
  }

  private normalizeNumericDecisionValue(
    value: unknown,
    min: number,
    max: number
  ): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return undefined;
    }
    const rounded = this.roundHalfAwayFromZero(value);
    return Math.min(max, Math.max(min, rounded));
  }

  private normalizeDecisionConfidence(value: unknown): DecisionConfidence | undefined {
    if (typeof value !== 'string') return undefined;
    const normalized = value.trim().toLowerCase() as DecisionConfidence;
    return DECISION_CONFIDENCE_SET.has(normalized) ? normalized : undefined;
  }

  private normalizeArrangementIntent(value: unknown): ArrangementIntent | undefined {
    if (typeof value !== 'string') return undefined;
    const normalized = value.trim().toLowerCase();
    return ARRANGEMENT_INTENT_MAP[normalized];
  }

  private normalizeDecisionBlock(value: unknown): StructuredMusicalDecision | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }

    const raw = value as Record<string, unknown>;
    const normalized: StructuredMusicalDecision = {};

    const tempoDelta = this.normalizeNumericDecisionValue(raw.tempo_delta_pct, -50, 50);
    if (tempoDelta !== undefined) {
      normalized.tempo_delta_pct = tempoDelta;
    }

    const energyDelta = this.normalizeNumericDecisionValue(raw.energy_delta, -3, 3);
    if (energyDelta !== undefined) {
      normalized.energy_delta = energyDelta;
    }

    const arrangementIntent = this.normalizeArrangementIntent(raw.arrangement_intent);
    if (arrangementIntent !== undefined) {
      normalized.arrangement_intent = arrangementIntent;
    }

    const confidence = this.normalizeDecisionConfidence(raw.confidence);
    if (confidence !== undefined) {
      normalized.confidence = confidence;
    }

    return Object.keys(normalized).length > 0 ? normalized : undefined;
  }

  private clampNumeric(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private roundHalfAwayFromZero(value: number): number {
    if (!Number.isFinite(value) || value === 0) return 0;
    const roundedMagnitude = Math.round(Math.abs(value));
    if (roundedMagnitude === 0) return 0;
    return value < 0 ? -roundedMagnitude : roundedMagnitude;
  }

  private getDecisionConfidenceMultiplier(confidence: DecisionConfidence | undefined): number {
    if (!confidence) return 1;
    return DECISION_CONFIDENCE_MULTIPLIER[confidence];
  }

  private isDeltaDirectionCompatible(value: number, cueDirection: RelativeCueDirection): boolean {
    if (cueDirection === 'increase') return value > 0;
    if (cueDirection === 'decrease') return value < 0;
    return false;
  }

  private aggregateRelativeDecisionFieldForCurrentTurn(
    responses: Array<AgentResponse | null>,
    field: 'tempo_delta_pct' | 'energy_delta',
    cueDirection: RelativeCueDirection
  ): number | undefined {
    if (cueDirection === null || cueDirection === 'mixed') {
      return undefined;
    }

    const scaledValues: number[] = [];

    for (const response of responses) {
      const decision = response?.decision;
      if (!decision) continue;
      const rawValue = decision[field];
      if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) continue;
      if (!this.isDeltaDirectionCompatible(rawValue, cueDirection)) continue;

      const effectiveValue = rawValue * this.getDecisionConfidenceMultiplier(decision.confidence);
      if (effectiveValue === 0) continue;
      scaledValues.push(effectiveValue);
    }

    if (scaledValues.length === 0) return undefined;

    const average = scaledValues.reduce((sum, value) => sum + value, 0) / scaledValues.length;
    const rounded = this.roundHalfAwayFromZero(average);
    return rounded === 0 ? undefined : rounded;
  }

  private applyModelRelativeContextDeltaForDirectiveTurn(params: {
    responses: Array<AgentResponse | null>;
    deterministicContextDelta: Partial<MusicalContext> | null;
    relativeContextCues: ReturnType<typeof detectRelativeMusicalContextCues>;
  }): Partial<MusicalContext> | null {
    const { responses, deterministicContextDelta, relativeContextCues } = params;
    const changes: Partial<MusicalContext> = {};
    const current = this.musicalContext;

    const deterministicTempoApplied = deterministicContextDelta?.bpm !== undefined;
    if (relativeContextCues.tempo && !deterministicTempoApplied) {
      const tempoDeltaPct = this.aggregateRelativeDecisionFieldForCurrentTurn(
        responses,
        'tempo_delta_pct',
        relativeContextCues.tempo
      );
      if (tempoDeltaPct !== undefined) {
        const bpmDelta = this.roundHalfAwayFromZero((current.bpm * tempoDeltaPct) / 100);
        if (bpmDelta !== 0) {
          const nextBpm = this.clampNumeric(current.bpm + bpmDelta, 60, 300);
          if (nextBpm !== current.bpm) {
            changes.bpm = nextBpm;
          }
        }
      }
    }

    const deterministicEnergyApplied = deterministicContextDelta?.energy !== undefined;
    if (relativeContextCues.energy && !deterministicEnergyApplied) {
      const energyDelta = this.aggregateRelativeDecisionFieldForCurrentTurn(
        responses,
        'energy_delta',
        relativeContextCues.energy
      );
      if (energyDelta !== undefined) {
        const nextEnergy = this.clampNumeric(current.energy + energyDelta, 1, 10);
        if (nextEnergy !== current.energy) {
          changes.energy = nextEnergy;
        }
      }
    }

    if (Object.keys(changes).length === 0) {
      return null;
    }

    // Minimal code-owned guardrails: normalized decision ranges + final context clamps.
    this.musicalContext = { ...this.musicalContext, ...changes };
    return changes;
  }

  private formatCodexErrorForLog(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return 'unknown error';

    try {
      const parsed = JSON.parse(trimmed) as {
        message?: unknown;
        error?: { message?: unknown; param?: unknown; code?: unknown };
      };
      const baseMessage =
        typeof parsed.error?.message === 'string'
          ? parsed.error.message
          : typeof parsed.message === 'string'
            ? parsed.message
            : trimmed;
      const paramSuffix = typeof parsed.error?.param === 'string'
        ? ` (param=${parsed.error.param})`
        : '';
      const codeSuffix = typeof parsed.error?.code === 'string'
        ? ` [${parsed.error.code}]`
        : '';
      return `${baseMessage}${paramSuffix}${codeSuffix}`;
    } catch {
      return trimmed.replace(/\s+/g, ' ');
    }
  }

  /**
   * Parse raw text response into AgentResponse JSON.
   * Handles markdown code fences and extracts JSON.
   */
  private parseAgentResponse(text: string, key: string): AgentResponse | null {
    const trimmed = text.trim();
    if (!trimmed) {
      console.warn(`[Agent:${key}] Empty response`);
      return null;
    }

    try {
      // Try direct JSON parse first
      const direct = JSON.parse(trimmed);
      const validated = this.validateAgentResponseShape(direct, key);
      if (validated) return validated;
    } catch {
      // Try extracting JSON from surrounding text.
    }

    const jsonMatch = text.match(/\{[\s\S]*"pattern"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const extracted = JSON.parse(jsonMatch[0]);
        const validated = this.validateAgentResponseShape(extracted, key);
        if (validated) return validated;
      } catch {
        // fall through
      }
    }

    console.warn(`[Agent:${key}] Failed to parse response:`, text.substring(0, 200));
    return null;
  }

  // ─── Private: Jam Flow ───────────────────────────────────────────

  private async sendJamStart(): Promise<void> {
    return this.enqueueTurn('jam-start', async () => {
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
          `Genre: ${ctx.genre}`,
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
    });
  }

  private formatAgentBandState(k: string): string {
    return formatBandStateLine(k, this.agentPatterns[k] || 'silence');
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
      .map((k) => this.formatAgentBandState(k));

    return [
      'DIRECTIVE from the boss.',
      `Round: ${this.roundNumber}`,
      '',
      isBroadcast
        ? `BOSS SAYS: ${directive}`
        : `BOSS SAYS TO YOU: ${directive}`,
      '',
      `Current musical context: Genre=${ctx.genre}, Key=${ctx.key}, BPM=${ctx.bpm}, Energy=${ctx.energy}/10`,
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
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    if (this.stopped) return;

    this.tickTimer = setInterval(() => {
      if (this.stopped || this.tickScheduled) return;
      this.tickScheduled = true;
      this.sendAutoTick()
        .catch((err) => {
          console.error('[AgentManager] Auto-tick error:', err);
        })
        .finally(() => {
          this.tickScheduled = false;
        });
    }, 30000);
  }

  private async sendAutoTick(): Promise<void> {
    return this.enqueueTurn('auto-tick', async () => {
      if (this.stopped) return;

      this.roundNumber++;
      const ctx = this.musicalContext;
      const activeTargets = this.activeAgents.filter((key) => this.agents.has(key));

      console.log(`[AgentManager] Auto-tick round ${this.roundNumber}`);

      const responsePromises = activeTargets.map((key) => {
        const bandStateLines = this.activeAgents
          .filter((k) => k !== key)
          .map((k) => this.formatAgentBandState(k));

        const myPattern = this.agentPatterns[key] || 'silence';

        const context = [
          'AUTO-TICK — LISTEN AND EVOLVE',
          `Round: ${this.roundNumber}`,
          `Genre: ${ctx.genre}`,
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

      for (let i = 0; i < activeTargets.length; i++) {
        const key = activeTargets[i];
        const response = responses[i];
        this.applyAgentResponse(key, response);
      }

      this.composeAndBroadcast();
    });
  }

  // ─── Private: State Management ───────────────────────────────────

  private applyAgentResponse(key: string, response: AgentResponse | null): void {
    const state = this.agentStates[key];
    if (!state) return;

    if (response) {
      this.agentDecisions[key] = response.decision;
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
    const jamState = this.getJamStateSnapshot();

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
      const proc = agent.activeTurn;
      if (!proc || proc.killed || proc.exitCode !== null) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        proc.kill('SIGKILL');
        resolve();
      }, 3000);

      proc.once('exit', () => {
        clearTimeout(timeout);
        agent.activeTurn = null;
        agent.activeTurnRl?.close();
        agent.activeTurnRl = null;
        resolve();
      });

      agent.activeTurnRl?.close();
      agent.activeTurnRl = null;
      proc.kill('SIGTERM');
    });
  }
}
