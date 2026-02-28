import { spawn, ChildProcess } from 'child_process';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import type {
  AgentState,
  AudioFeatureSnapshot,
  MusicalContext,
  JamState,
  AutoTickTiming,
  AgentThoughtPayload,
  AgentCommentaryPayload,
  AutoTickTimingPayload,
  AutoTickFiredPayload,
  AgentStatusPayload,
  JamStatePayload,
  StructuredMusicalDecision,
  DecisionConfidence,
  ArrangementIntent,
  JamTurnSource,
} from './types';
import { AGENT_META } from './types';
import { formatBandStateLine, validatePatternForJam } from './pattern-parser';
import {
  deriveChordProgression,
  deriveScale,
  detectRelativeMusicalContextCues,
  parseDeterministicMusicalContextChanges,
} from './musical-context-parser';
import {
  getPresetById,
  presetToMusicalContext,
  randomMusicalContext,
  UNCONFIGURED_MUSICAL_CONTEXT,
} from './musical-context-presets';
import { map_codex_event_to_runtime_events } from './codex-process';
import {
  assert_codex_runtime_ready,
  build_codex_overrides,
  CODEX_JAM_PROFILE,
  load_project_codex_config,
} from './codex-runtime-checks';
import { SHARED_JAM_POLICY_PROMPT } from './jam-agent-shared-policy';
import { buildGenreEnergySection } from './genre-energy-guidance';
import { JAM_GOVERNANCE } from './jam-governance-constants';
import {
  buildAutoTickManagerContext,
  buildDirectiveManagerContext,
  buildJamStartManagerContext,
} from './jam-manager-context-templates';

// Callback type for broadcasting messages to browser clients
export type BroadcastFn = (message: { type: string; payload: unknown }) => void;

// Agent key → agent persona filename (without .md)
const AGENT_KEY_TO_FILE: Record<string, string> = {
  drums: 'drummer',
  bass: 'bassist',
  melody: 'melody',
  chords: 'chords',
};

// Canonical Codex path for jam agent persona prompts.
const AGENT_PROMPT_DIR_CANDIDATES = [
  ['.codex', 'agents'],
] as const;

// Expected JSON response from each agent
interface AgentResponse {
  pattern: string;
  thoughts: string;
  commentary?: string;
  decision?: StructuredMusicalDecision;
}

interface AgentCommentaryRuntimeState {
  lastRound: number | null;
  recentSignatures: string[];
}

interface AgentTurnContext {
  directiveTargetAgent?: string;
}

const AUDIO_FEEDBACK_TTL_MS = 12_000;

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

export type JamStartMode = 'autonomous_opening' | 'staged_silent';

interface StartJamOptions {
  mode?: JamStartMode;
}

// Codex CLI `exec` no longer accepts legacy `--tools/--strict-mcp-config` flags.
// Jam agents remain isolated via the dedicated `jam_agent` profile (MCP disabled)
// plus prompt-level policy; keep this empty for CLI compatibility.
const JAM_TOOLLESS_ARGS = [] as const;
// Deterministic schema canonicalization only: normalize common phrasing/spelling
// variants into the fixed arrangement enum without prescribing musical content.
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
type RelativeCueDirection = ReturnType<typeof detectRelativeMusicalContextCues>['tempo'];
const TARGETED_DIRECTIVE_EMPTY_COMMENTARY = 'Locking in your cue.';

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
  private agentCommentaryState: Record<string, AgentCommentaryRuntimeState> = {};
  private agentAutoTickNoChangeStreak: Record<string, number> = {};
  private agentPendingThreadCompaction: Record<string, boolean> = {};
  private musicalContext: MusicalContext = randomMusicalContext();
  private activeAgents: string[] = [];
  private activatedAgents: string[] = [];
  private mutedAgents = new Set<string>();
  private broadcast: BroadcastFn;
  private workingDir: string;
  private stopped = false;
  private roundNumber = 0;
  private tickTimer: NodeJS.Timeout | null = null;
  private tickScheduled = false;
  private nextAutoTickAtMs: number | null = null;
  private cacheTtlWarnedAgents = new Set<string>();
  private turnInProgress: Promise<void> = Promise.resolve();
  private turnCounter = 0;
  private strudelReference: string = '';
  private sessionId = 'direct-0';
  private codexConfigOverrides: string[] = [];
  private codexJamDefaultModel = 'gpt-5-codex-mini';
  private jamStartMode: JamStartMode = 'autonomous_opening';
  private presetConfigured = true;
  private latestAudioFeedback: AudioFeatureSnapshot | null = null;

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
   * then either free-jam immediately or wait silently for boss cues.
   */
  async start(activeAgents: string[], options: StartJamOptions = {}): Promise<void> {
    await assert_codex_runtime_ready({
      working_dir: this.workingDir,
    });
    const codexConfig = load_project_codex_config(this.workingDir);
    this.codexConfigOverrides = build_codex_overrides(codexConfig, CODEX_JAM_PROFILE);
    this.codexJamDefaultModel = codexConfig.jam_agent_model;
    this.jamStartMode = options.mode ?? 'autonomous_opening';

    const unknownAgentKeys = activeAgents.filter((key) => !AGENT_META[key]);
    if (unknownAgentKeys.length > 0) {
      throw new Error(`Unknown jam agent key(s): ${unknownAgentKeys.join(', ')}`);
    }

    this.activeAgents = [...activeAgents];
    this.activatedAgents = this.jamStartMode === 'staged_silent' ? [] : [...this.activeAgents];
    this.mutedAgents.clear();
    this.stopped = false;
    this.roundNumber = 0;
    this.tickScheduled = false;
    this.nextAutoTickAtMs = null;
    this.cacheTtlWarnedAgents.clear();
    this.sessionId = 'direct-' + Date.now();
    this.presetConfigured = this.jamStartMode !== 'staged_silent';
    this.musicalContext = this.jamStartMode === 'staged_silent'
      ? {
          ...UNCONFIGURED_MUSICAL_CONTEXT,
          scale: [...UNCONFIGURED_MUSICAL_CONTEXT.scale],
          chordProgression: [...UNCONFIGURED_MUSICAL_CONTEXT.chordProgression],
        }
      : randomMusicalContext();
    this.agentDecisions = {};
    this.agentCommentaryState = {};
    this.agentAutoTickNoChangeStreak = {};
    this.agentPendingThreadCompaction = {};
    this.latestAudioFeedback = null;

    // Initialize state for each agent
    for (const key of this.activeAgents) {
      const meta = AGENT_META[key];
      this.agentPatterns[key] = '';
      this.agentStates[key] = {
        name: meta.name,
        emoji: meta.emoji,
        pattern: '',
        fallbackPattern: '',
        thoughts: '',
        status: 'idle',
        lastUpdated: new Date().toISOString(),
      };
      this.agentDecisions[key] = undefined;
      this.agentCommentaryState[key] = {
        lastRound: null,
        recentSignatures: [],
      };
      this.agentAutoTickNoChangeStreak[key] = 0;
      this.agentPendingThreadCompaction[key] = false;
    }

    // Prepare one Codex-backed session per agent
    await Promise.all(this.activeAgents.map((key) => this.spawnAgent(key)));

    if (this.jamStartMode === 'autonomous_opening') {
      // Send initial jam context to each agent and collect responses
      await this.sendJamStart();
    } else {
      // Staged silent mode: no opening prompts until the boss explicitly cues an agent.
      this.resetAutoTickDeadline();
      this.broadcastJamStateOnly('staged-silent');
    }

    // Start autonomous evolution ticks
    this.startAutoTick();
  }

  /**
   * Apply a specific preset to a staged-silent jam before the first join.
   */
  async setJamPreset(presetId: string): Promise<void> {
    return this.enqueueTurn('set-preset', async () => {
      if (this.stopped) return;

      if (this.activatedAgents.length > 0) {
        throw new Error('Preset is locked after the first agent joins.');
      }

      const preset = getPresetById(presetId);
      if (!preset) {
        throw new Error(`Unknown jam preset: ${presetId}`);
      }

      this.musicalContext = presetToMusicalContext(preset);
      this.presetConfigured = true;

      // Rebuild agent prompts so genre-specific guidance reflects the chosen preset
      // before any agent takes its first turn in staged-silent mode.
      for (const [key, agent] of Array.from(this.agents.entries())) {
        const rebuilt = this.buildAgentSystemPrompt(key);
        if (!rebuilt) continue;
        agent.systemPrompt = rebuilt.prompt;
        agent.model = rebuilt.model;
      }

      this.broadcastJamStateOnly('staged-silent');
    });
  }

  /**
   * Receive a compact client-side spectral summary from the browser audio loop.
   */
  handleAudioFeedback(payload: AudioFeatureSnapshot): void {
    const normalized = this.normalizeAudioFeedback(payload);
    if (!normalized) {
      return;
    }

    this.latestAudioFeedback = normalized;
  }

  private getFreshAudioFeedbackSection(contextNowMs = Date.now()): AudioFeatureSnapshot | undefined {
    if (!this.latestAudioFeedback) {
      return undefined;
    }

    if (contextNowMs - this.latestAudioFeedback.capturedAtMs > AUDIO_FEEDBACK_TTL_MS) {
      return undefined;
    }

    return this.latestAudioFeedback;
  }

  private normalizeAudioFeedback(payload: AudioFeatureSnapshot): AudioFeatureSnapshot | null {
    if (
      typeof payload.capturedAtMs !== 'number'
      || !Number.isFinite(payload.capturedAtMs)
      || typeof payload.windowMs !== 'number'
      || !Number.isFinite(payload.windowMs)
      || typeof payload.loudnessDb !== 'number'
      || !Number.isFinite(payload.loudnessDb)
      || typeof payload.spectralCentroidHz !== 'number'
      || !Number.isFinite(payload.spectralCentroidHz)
      || typeof payload.lowBandEnergy !== 'number'
      || !Number.isFinite(payload.lowBandEnergy)
      || typeof payload.midBandEnergy !== 'number'
      || !Number.isFinite(payload.midBandEnergy)
      || typeof payload.highBandEnergy !== 'number'
      || !Number.isFinite(payload.highBandEnergy)
      || typeof payload.spectralFlux !== 'number'
      || !Number.isFinite(payload.spectralFlux)
      || typeof payload.onsetDensity !== 'number'
      || !Number.isFinite(payload.onsetDensity)
    ) {
      return null;
    }

    const safeTimestamp = payload.capturedAtMs > 0 ? payload.capturedAtMs : Date.now();

    return {
      capturedAtMs: safeTimestamp,
      windowMs: this.sanitizeFeatureInt(payload.windowMs, 250, 10_000, 1000),
      loudnessDb: this.sanitizeFeatureInt(payload.loudnessDb, 0, 100, 0),
      spectralCentroidHz: this.sanitizeFeatureInt(payload.spectralCentroidHz, 0, 40_000, 0),
      lowBandEnergy: this.sanitizeFeatureInt(payload.lowBandEnergy, 0, 100, 0),
      midBandEnergy: this.sanitizeFeatureInt(payload.midBandEnergy, 0, 100, 0),
      highBandEnergy: this.sanitizeFeatureInt(payload.highBandEnergy, 0, 100, 0),
      spectralFlux: this.sanitizeFeatureInt(payload.spectralFlux, 0, 100, 0),
      onsetDensity: this.sanitizeFeatureInt(payload.onsetDensity, 0, 100, 0),
    };
  }

  private sanitizeFeatureInt(
    value: number,
    min: number,
    max: number,
    fallback: number
  ): number {
    if (!Number.isFinite(value)) return fallback;
    const rounded = Math.round(value);
    if (rounded < min) return min;
    if (rounded > max) return max;
    return rounded;
  }

  /**
   * Route a boss directive to the target agent(s).
   */
  async handleDirective(
    text: string,
    targetAgent: string | undefined,
    activeAgents: string[]
  ): Promise<void> {
    void activeAgents; // routing uses manager-owned session membership, not client input

    return this.enqueueTurn('directive', async () => {
      if (this.stopped) return;

      // Reset tick timer to avoid double-triggering during directive
      if (this.tickTimer) clearInterval(this.tickTimer);

      if (!this.presetConfigured) {
        this.broadcastWs('directive_error', {
          message: 'Choose a genre preset and press Play before sending directives.',
          targetAgent,
        });
        this.startAutoTick();
        return;
      }

      // Guard: if a specific agent was targeted but is unavailable, error early
      if (targetAgent) {
        const meta = AGENT_META[targetAgent];
        const name = meta?.name ?? targetAgent;

        if (!this.activeAgents.includes(targetAgent)) {
          const reason = `${name} is not in this jam session`;
          console.warn(`[AgentManager] Directive target unavailable: ${reason}`);
          this.broadcastWs('directive_error', { message: reason, targetAgent });
          this.startAutoTick();
          return;
        }

        if (!this.agents.has(targetAgent)) {
          const reason = `${name}'s process is unavailable`;
          console.warn(`[AgentManager] Directive target unavailable: ${reason}`);
          this.broadcastWs('directive_error', { message: reason, targetAgent });
          this.startAutoTick();
          return;
        }
      }

      const forceMuteTarget = Boolean(targetAgent && this.isExplicitMuteDirective(text));
      if (targetAgent && this.mutedAgents.has(targetAgent) && !forceMuteTarget) {
        // Any targeted non-mute cue counts as an explicit re-entry request.
        this.mutedAgents.delete(targetAgent);
        this.resetThreadCompactionState(targetAgent);
      }

      // Apply deterministic anchors first (explicit BPM / half/double-time / explicit energy / key).
      // Relative tempo/energy cues are handled after agent responses using model decisions.
      // Intentionally uses split deterministic anchors + relative cue detection
      // so coarse synthetic fallback deltas cannot re-enter jam runtime paths.
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
      let targets: string[] = [];
      if (targetAgent) {
        if (!this.activatedAgents.includes(targetAgent)) {
          this.activatedAgents = [...this.activatedAgents, targetAgent];
        }
        targets = [targetAgent];
      } else {
        targets = this.activatedAgents.filter(
          (k) => this.agents.has(k) && !this.mutedAgents.has(k)
        );
        if (targets.length === 0) {
          const hasMutedActives = this.activatedAgents.some(
            (k) => this.agents.has(k) && this.mutedAgents.has(k)
          );
          this.broadcastWs('directive_error', {
            message: hasMutedActives
              ? 'All active agents are currently muted. @mention an agent to unmute or add a new one.'
              : 'No agents are active yet. @mention an agent to start the jam.',
          });
          this.startAutoTick();
          return;
        }
      }

      // Set targeted agents to "thinking"
      for (const key of targets) {
        // Any directive interaction makes this agent's recent context relevant
        // again, so clear deferred compaction state.
        this.resetThreadCompactionState(key);
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
      const recoveredResponses = await Promise.all(targets.map(async (key, index) => {
        const rawResponse = responses[index];
        if (forceMuteTarget && targetAgent === key) {
          return this.coerceResponseToForcedSilence(rawResponse);
        }
        return this.recoverDirectiveResponseIfNeeded({
          key,
          response: rawResponse,
          directive: text,
          targetAgent,
        });
      }));

      const patternsBeforeTurn = { ...this.agentPatterns };

      // Process responses and update state
      for (let i = 0; i < targets.length; i++) {
        const key = targets[i];
        const response = recoveredResponses[i];

        if (forceMuteTarget && targetAgent === key) {
          this.mutedAgents.add(key);
          this.resetThreadCompactionState(key);
        }

        const acceptedResponse = this.applyAgentResponse(key, response, 'directive', {
          directiveTargetAgent: targetAgent,
        });
        responses[i] = acceptedResponse;
      }

      const modelRelativeContextDelta = this.applyModelRelativeContextDeltaForDirectiveTurn({
        responses,
        deterministicContextDelta,
        relativeContextCues,
      });
      if (modelRelativeContextDelta) {
        console.log('[AgentManager] Model-relative musical context updated:', modelRelativeContextDelta);
      }

      // Restart auto-tick after directive completes
      this.startAutoTick();

      // Compose all patterns and broadcast
      const changedAgents = this.computeChangedAgents(patternsBeforeTurn);
      this.composeAndBroadcast('directive', changedAgents);
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
    this.nextAutoTickAtMs = null;

    // Kill all active agent turns
    const killPromises = Array.from(this.agents.values()).map((agent) =>
      this.killProcess(agent)
    );
    await Promise.all(killPromises);
    this.agents.clear();

    this.agentPatterns = {};
    this.agentStates = {};
    this.agentDecisions = {};
    this.agentCommentaryState = {};
    this.agentAutoTickNoChangeStreak = {};
    this.agentPendingThreadCompaction = {};
    this.activeAgents = [];
    this.activatedAgents = [];
    this.mutedAgents.clear();
    this.sessionId = 'direct-0';
    this.turnInProgress = Promise.resolve();
    this.turnCounter = 0;
    this.codexConfigOverrides = [];
    this.jamStartMode = 'autonomous_opening';
    this.presetConfigured = true;
    this.latestAudioFeedback = null;
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
      activatedAgents: [...this.activatedAgents],
      mutedAgents: this.activatedAgents.filter((key) => this.mutedAgents.has(key)),
      autoTick: this.getAutoTickTimingSnapshot(),
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
      'Required keys: pattern, thoughts.',
      'Optional keys: commentary, decision (tempo_delta_pct, energy_delta, arrangement_intent, confidence, suggested_key, suggested_chords).',
      'commentary is an optional short band-chat line about feel/interplay/boss cues. Omit commentary instead of filler.',
      'Use decision only when relevant; omit decision or any field when not relevant or not confident.',
      'tempo_delta_pct is relative percent vs current BPM (positive=faster, negative=slower).',
      'energy_delta is relative energy steps (positive=more energy, negative=less energy).',
      'suggested_key is a key string like "Eb major" or "D minor" — only when you feel a modulation is needed.',
      'suggested_chords is an array like ["Am", "F", "C", "G"] — only when you want to propose a new progression.',
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
      const attemptTurn = (attempt: number): void => {
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
          console.warn(
            `[Agent:${key}] Response timeout after ${JAM_GOVERNANCE.AGENT_TIMEOUT_MS}ms`
          );
          if (!proc.killed) {
            proc.kill('SIGTERM');
          }
          finish();
        }, JAM_GOVERNANCE.AGENT_TIMEOUT_MS);

        let fullText = '';
        let settled = false;
        let parseState = { saw_assistant_delta: false };
        let lastCodexError: string | null = null;
        let transportError = false;

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

          const response = this.parseAgentResponse(fullText, key);
          if (transportError && attempt < 1) {
            attemptTurn(attempt + 1);
            return;
          }

          resolve(response);
        };

        rl.on('line', onLine);

        proc.stderr?.on('data', (data) => {
          const text = data.toString().trim();
          if (!text) return;

          if (this.isCodexTransportError(text)) {
            transportError = true;
            console.error(`[Agent:${key}] Codex transport error: ${text}`);
            if (!proc.killed) {
              proc.kill('SIGTERM');
            }
            finish();
            return;
          }

          if (this.isNonFatalCodexCacheTtlWarning(text)) {
            if (!this.cacheTtlWarnedAgents.has(key)) {
              this.cacheTtlWarnedAgents.add(key);
              console.warn(`[Agent:${key}] Non-fatal Codex cache warning: ${text}`);
            }
            return;
          }
          console.error(`[Agent:${key} stderr]:`, text);
        });

        proc.on('error', (err) => {
          console.error(`[Agent:${key}] Process error:`, err);
          this.setAgentStatus(key, 'error');
        });

        proc.on('exit', (code, signal) => {
          console.log(
            `[Agent:${key}] Turn exited (attempt ${attempt + 1}): code=${code}, signal=${signal}`
          );
          if (
            !transportError &&
            typeof code === 'number' &&
            code !== 0
          ) {
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
      };

      attemptTurn(0);
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
    ) {
      console.warn(`[Agent:${key}] Invalid response schema (missing pattern/thoughts strings)`);
      return null;
    }

    let commentary: string | undefined;
    if (typeof parsed.commentary === 'string') {
      commentary = parsed.commentary;
    } else if (typeof parsed.reaction === 'string') {
      // Backward-compatible alias while prompts/personas/tests transition.
      commentary = parsed.reaction;
    }

    return {
      pattern: parsed.pattern,
      thoughts: parsed.thoughts,
      commentary,
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

  private normalizeSuggestedKey(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const match = value.trim().match(/^([A-Ga-g])([bB#]?)\s+(major|minor)$/i);
    if (!match) return undefined;

    const root = match[1].toUpperCase();
    const accidental = match[2] === 'B' ? 'b' : match[2];
    const quality = match[3].toLowerCase();
    const normalized = `${root}${accidental} ${quality}`;

    // Reuse parser validation so accepted suggestions are actually applicable.
    return deriveScale(normalized) ? normalized : undefined;
  }

  private normalizeDecisionBlock(value: unknown): StructuredMusicalDecision | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }

    const raw = value as Record<string, unknown>;
    // Code-owned safety step: accept only the structured decision fields we know,
    // normalize their shapes, and clamp to model-agnostic bounds.
    const normalized: StructuredMusicalDecision = {};

    const tempoDelta = this.normalizeNumericDecisionValue(raw.tempo_delta_pct, JAM_GOVERNANCE.TEMPO_DELTA_PCT_MIN, JAM_GOVERNANCE.TEMPO_DELTA_PCT_MAX);
    if (tempoDelta !== undefined) {
      normalized.tempo_delta_pct = tempoDelta;
    }

    const energyDelta = this.normalizeNumericDecisionValue(raw.energy_delta, JAM_GOVERNANCE.ENERGY_DELTA_MIN, JAM_GOVERNANCE.ENERGY_DELTA_MAX);
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

    const suggestedKey = this.normalizeSuggestedKey(raw.suggested_key);
    if (suggestedKey !== undefined) {
      normalized.suggested_key = suggestedKey;
    }

    // Validate suggested_chords: must be a non-empty array of strings
    if (Array.isArray(raw.suggested_chords) && raw.suggested_chords.length > 0) {
      const validChords = raw.suggested_chords.filter(
        (c: unknown) => typeof c === 'string' && c.trim().length > 0
      ) as string[];
      if (validChords.length > 0) {
        normalized.suggested_chords = validChords;
      }
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
    return JAM_GOVERNANCE.CONFIDENCE_MULTIPLIER[confidence];
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
          const nextBpm = this.clampNumeric(current.bpm + bpmDelta, JAM_GOVERNANCE.BPM_MIN, JAM_GOVERNANCE.BPM_MAX);
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
        const nextEnergy = this.clampNumeric(current.energy + energyDelta, JAM_GOVERNANCE.ENERGY_MIN, JAM_GOVERNANCE.ENERGY_MAX);
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

  /**
   * Aggregate tempo/energy decisions from auto-tick responses.
   * Simpler than directive-turn version: no boss cue direction to match.
   * Applies 0.5x dampening to prevent runaway drift across frequent auto-ticks.
   */
  private applyModelRelativeContextDeltaForAutoTick(
    responses: Array<AgentResponse | null>
  ): Partial<MusicalContext> | null {
    const changes: Partial<MusicalContext> = {};
    const current = this.musicalContext;

    // Aggregate tempo_delta_pct
    const tempoValues: number[] = [];
    for (const response of responses) {
      const decision = response?.decision;
      if (!decision) continue;
      const raw = decision.tempo_delta_pct;
      if (typeof raw !== 'number' || !Number.isFinite(raw) || raw === 0) continue;
      const multiplier = this.getDecisionConfidenceMultiplier(decision.confidence);
      if (multiplier === 0) continue;
      tempoValues.push(raw * multiplier);
    }
    if (tempoValues.length > 0) {
      const avg = tempoValues.reduce((s, v) => s + v, 0) / tempoValues.length;
      const dampened = avg * JAM_GOVERNANCE.AUTO_TICK_DAMPENING;
      const bpmDelta = this.roundHalfAwayFromZero((current.bpm * dampened) / 100);
      if (bpmDelta !== 0) {
        const nextBpm = this.clampNumeric(current.bpm + bpmDelta, JAM_GOVERNANCE.BPM_MIN, JAM_GOVERNANCE.BPM_MAX);
        if (nextBpm !== current.bpm) {
          changes.bpm = nextBpm;
        }
      }
    }

    // Aggregate energy_delta
    const energyValues: number[] = [];
    for (const response of responses) {
      const decision = response?.decision;
      if (!decision) continue;
      const raw = decision.energy_delta;
      if (typeof raw !== 'number' || !Number.isFinite(raw) || raw === 0) continue;
      const multiplier = this.getDecisionConfidenceMultiplier(decision.confidence);
      if (multiplier === 0) continue;
      energyValues.push(raw * multiplier);
    }
    if (energyValues.length > 0) {
      const avg = energyValues.reduce((s, v) => s + v, 0) / energyValues.length;
      const dampened = avg * JAM_GOVERNANCE.AUTO_TICK_DAMPENING;
      const energyDelta = this.roundHalfAwayFromZero(dampened);
      if (energyDelta !== 0) {
        const nextEnergy = this.clampNumeric(current.energy + energyDelta, JAM_GOVERNANCE.ENERGY_MIN, JAM_GOVERNANCE.ENERGY_MAX);
        if (nextEnergy !== current.energy) {
          changes.energy = nextEnergy;
        }
      }
    }

    if (Object.keys(changes).length === 0) return null;

    this.musicalContext = { ...this.musicalContext, ...changes };
    return changes;
  }

  /**
   * Process agent key/chord suggestions from decision blocks.
   * - Key: only applied if 2+ agents suggest the same key (consensus).
   * - Chords: only applied if a single agent suggests with high confidence.
   * When a key change is applied, scale and chords are auto-derived.
   */
  private applyContextSuggestions(
    responses: Array<AgentResponse | null>
  ): Partial<MusicalContext> | null {
    const changes: Partial<MusicalContext> = {};

    // Collect high-confidence key suggestions and count consensus.
    // Key modulation mutates global harmonic context, so we gate it more strictly
    // than presence-only suggestions.
    const keyCounts = new Map<string, number>();
    for (const response of responses) {
      const decision = response?.decision;
      const key = decision?.suggested_key;
      if (!key || decision.confidence !== 'high') continue;
      const normalized = key.trim();
      keyCounts.set(normalized, (keyCounts.get(normalized) || 0) + 1);
    }

    // Apply key if 2+ agents agree
    let keyApplied = false;
    keyCounts.forEach((count, suggestedKey) => {
      if (keyApplied) return;
      if (count >= JAM_GOVERNANCE.KEY_CONSENSUS_MIN_AGENTS && suggestedKey !== this.musicalContext.key) {
        const scale = deriveScale(suggestedKey);
        if (scale) {
          changes.key = suggestedKey;
          changes.scale = scale;
          // C (hybrid) continuity fallback (MCP-04 / bsj-7k4.15):
          // Auto-derive minimal diatonic chords so the jam has a valid
          // progression immediately after a key change. Agents may
          // override with genre-specific chords on subsequent turns
          // via suggested_chords.
          const chords = deriveChordProgression(suggestedKey);
          if (chords) {
            changes.chordProgression = chords;
          }
          keyApplied = true;
        }
      }
    });

    // Apply chord suggestions (high confidence only, skip if key was just changed).
    // When a key change is applied above, the auto-derived fallback chords take
    // precedence on this turn. This prevents a stale chord suggestion (targeting
    // the old key) from overriding the freshly derived progression. Agents can
    // suggest genre-appropriate chords on the next turn once they see the new key.
    if (!keyApplied) {
      for (const response of responses) {
        const decision = response?.decision;
        if (!decision?.suggested_chords || decision.confidence !== 'high') continue;
        changes.chordProgression = decision.suggested_chords;
        break; // first high-confidence suggestion wins
      }
    }

    if (Object.keys(changes).length === 0) return null;

    this.musicalContext = { ...this.musicalContext, ...changes };
    this.broadcastWs('musical_context_update', { musicalContext: { ...this.musicalContext } });
    return changes;
  }

  private formatCodexErrorForLog(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return 'unknown error';

    try {
      // Log-only formatting for operator diagnostics; websocket/user error surfacing
      // still uses the runtime event payloads and does not depend on this rewrite.
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
   * This is a parsing-resilience fallback only; we still validate the schema and
   * do not rewrite pattern content.
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

  private isNonFatalCodexCacheTtlWarning(text: string): boolean {
    return /failed to renew cache TTL: EOF while parsing a value at line 1 column 0/i.test(text);
  }

  private isCodexTransportError(text: string): boolean {
    return /failed to connect to websocket/i.test(text) &&
      /(connection reset by peer|os error 54|io error|econnreset)/i.test(text);
  }

  private resetThreadCompactionState(key: string): void {
    this.agentAutoTickNoChangeStreak[key] = 0;
    this.agentPendingThreadCompaction[key] = false;
  }

  private applyPendingThreadCompactionForAutoTick(key: string): void {
    if (!this.agentPendingThreadCompaction[key]) return;

    const agent = this.agents.get(key);
    if (!agent) {
      this.resetThreadCompactionState(key);
      return;
    }

    const oldThreadId = agent.threadId;
    agent.threadId = null;
    this.agentPendingThreadCompaction[key] = false;
    this.agentAutoTickNoChangeStreak[key] = 0;

    console.log(
      `[AgentManager] Thread compaction applied for ${key}. ` +
      `Old thread: ${oldThreadId?.slice(0, 12) ?? 'null'}. ` +
      'Next turn starts a fresh thread.'
    );
  }

  private recordAutoTickCompactionSignal(params: {
    key: string;
    acceptedResponse: AgentResponse | null;
    patternBeforeTurn: string;
  }): void {
    const { key, acceptedResponse, patternBeforeTurn } = params;

    if (!this.agents.has(key)) {
      this.resetThreadCompactionState(key);
      return;
    }

    const qualifies =
      !!acceptedResponse
      && acceptedResponse.pattern === 'no_change'
      && !!patternBeforeTurn
      && patternBeforeTurn !== 'silence';

    if (!qualifies) {
      this.agentAutoTickNoChangeStreak[key] = 0;
      return;
    }

    const nextCount = (this.agentAutoTickNoChangeStreak[key] || 0) + 1;
    this.agentAutoTickNoChangeStreak[key] = nextCount;

    if (nextCount < JAM_GOVERNANCE.THREAD_COMPACTION_NO_CHANGE_STREAK) {
      return;
    }

    this.agentPendingThreadCompaction[key] = true;
    this.agentAutoTickNoChangeStreak[key] = 0;
    console.log(
      `[AgentManager] Thread compaction scheduled for ${key}: ` +
      `${nextCount} consecutive qualifying auto-tick no_change turns.`
    );
  }

  // ─── Private: Jam Flow ───────────────────────────────────────────

  private async sendJamStart(): Promise<void> {
    return this.enqueueTurn('jam-start', async () => {
      this.roundNumber++;
      const ctx = this.musicalContext;
      const audioFeedback = this.getFreshAudioFeedbackSection();
      const patternsBeforeTurn = { ...this.agentPatterns };

      const responsePromises = this.activeAgents.map((key) => {
        if (!this.agents.has(key)) return Promise.resolve(null);

        const bandStateLines = this.activeAgents.map((k) => {
          const meta = AGENT_META[k];
          if (!meta) return `${k}: [first round — no pattern yet]`;
          return `${meta.emoji} ${meta.name} (${k}): [first round — no pattern yet]`;
        });

        const context = buildJamStartManagerContext({
          roundNumber: this.roundNumber,
          musicalContext: ctx,
          bandStateLines,
          audioFeedback,
        });

        this.setAgentStatus(key, 'thinking');
        return this.sendToAgentAndCollect(key, context);
      });

      const responses = await Promise.all(responsePromises);

      for (let i = 0; i < this.activeAgents.length; i++) {
        const key = this.activeAgents[i];
        const response = responses[i];
        this.resetThreadCompactionState(key);
        this.applyAgentResponse(key, response, 'jam-start');
      }

      this.resetAutoTickDeadline();
      const changedAgents = this.computeChangedAgents(patternsBeforeTurn);
      this.composeAndBroadcast('jam-start', changedAgents);
    });
  }

  private formatAgentBandState(k: string): string {
    if (this.mutedAgents.has(k)) {
      return formatBandStateLine(k, 'silence');
    }
    return formatBandStateLine(k, this.agentPatterns[k] || 'silence');
  }

  private buildDirectiveContext(
    key: string,
    directive: string,
    targetAgent: string | undefined
  ): string {
    const ctx = this.musicalContext;
    const isBroadcast = !targetAgent;
    const audioFeedback = this.getFreshAudioFeedbackSection();

    const bandStateLines = this.activatedAgents
      .filter((k) => k !== key)
      .map((k) => this.formatAgentBandState(k));

    return buildDirectiveManagerContext({
      roundNumber: this.roundNumber,
      musicalContext: ctx,
      directive,
      isBroadcast,
      currentPattern: this.agentPatterns[key] || 'silence',
      bandStateLines,
      audioFeedback,
    });
  }

  private getPatternValidationFailureReason(pattern: string): string | null {
    if (!pattern || pattern === 'silence' || pattern === 'no_change') return null;

    const validation = validatePatternForJam(pattern);
    if (validation.valid) return null;
    return validation.reason || 'invalid pattern syntax';
  }

  private getResponseRejectReasonForRetry(response: AgentResponse | null): string | null {
    if (!response) {
      return 'empty, timed-out, or unparseable response';
    }

    const proposedPattern = response.pattern || 'silence';
    const patternFailure = this.getPatternValidationFailureReason(proposedPattern);
    if (!patternFailure) return null;
    return `invalid pattern (${patternFailure})`;
  }

  private buildDirectiveRepairContext(
    key: string,
    directive: string,
    targetAgent: string | undefined,
    rejectReason: string
  ): string {
    const base = this.buildDirectiveContext(key, directive, targetAgent);
    return [
      base,
      '',
      'RETRY NOTICE: Your previous response was rejected by runtime validation.',
      `Rejection reason: ${rejectReason}`,
      'Output only one JSON object with required keys pattern and thoughts.',
      'Ensure valid Strudel syntax (balanced mini delimiters and closed method chains).',
      'If syntax confidence is low, return "no_change" for pattern.',
    ].join('\n');
  }

  private async recoverDirectiveResponseIfNeeded(params: {
    key: string;
    response: AgentResponse | null;
    directive: string;
    targetAgent: string | undefined;
  }): Promise<AgentResponse | null> {
    const { key, response, directive, targetAgent } = params;
    const rejectReason = this.getResponseRejectReasonForRetry(response);
    if (!rejectReason) return response;

    console.warn(`[Agent:${key}] Directive response rejected (${rejectReason}). Retrying once.`);
    this.setAgentStatus(key, 'thinking');
    const retryContext = this.buildDirectiveRepairContext(
      key,
      directive,
      targetAgent,
      rejectReason
    );
    const retryResponse = await this.sendToAgentAndCollect(key, retryContext);
    const retryRejectReason = this.getResponseRejectReasonForRetry(retryResponse);
    if (!retryRejectReason) return retryResponse;

    console.warn(`[Agent:${key}] Directive retry rejected (${retryRejectReason}). Keeping previous groove.`);
    return retryResponse;
  }

  // ─── Private: Auto-Tick ─────────────────────────────────────────

  private resetAutoTickDeadline(): void {
    this.nextAutoTickAtMs = Date.now() + JAM_GOVERNANCE.AUTO_TICK_INTERVAL_MS;
  }

  private getAutoTickTimingSnapshot(): AutoTickTiming {
    return {
      intervalMs: JAM_GOVERNANCE.AUTO_TICK_INTERVAL_MS,
      nextTickAtMs: this.nextAutoTickAtMs,
      serverNowMs: Date.now(),
    };
  }

  private broadcastAutoTickTiming(): void {
    this.broadcastWs<AutoTickTimingPayload>('auto_tick_timing_update', {
      autoTick: this.getAutoTickTimingSnapshot(),
    });
  }

  private getAutoTickActiveTargets(): string[] {
    return this.activatedAgents.filter((key) => this.agents.has(key) && !this.mutedAgents.has(key));
  }

  private broadcastAutoTickFired(round: number, activeAgents: string[]): void {
    if (activeAgents.length === 0) return;

    this.broadcastWs<AutoTickFiredPayload>('auto_tick_fired', {
      sessionId: this.sessionId,
      round,
      activeAgents: [...activeAgents],
      autoTick: this.getAutoTickTimingSnapshot(),
      firedAtMs: Date.now(),
    });
  }

  private startAutoTick(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    if (this.stopped) {
      this.nextAutoTickAtMs = null;
      return;
    }

    this.resetAutoTickDeadline();
    this.broadcastAutoTickTiming();

    this.tickTimer = setInterval(() => {
      if (this.stopped) {
        this.nextAutoTickAtMs = null;
        return;
      }
      this.resetAutoTickDeadline();
      this.broadcastAutoTickTiming();
      if (this.tickScheduled) return;
      const activeTargets = this.getAutoTickActiveTargets();
      this.broadcastAutoTickFired(this.roundNumber + 1, activeTargets);
      this.tickScheduled = true;
      this.sendAutoTick(activeTargets)
        .catch((err) => {
          console.error('[AgentManager] Auto-tick error:', err);
        })
        .finally(() => {
          this.tickScheduled = false;
        });
    }, JAM_GOVERNANCE.AUTO_TICK_INTERVAL_MS);
  }

  private async sendAutoTick(activeTargetsInput?: string[]): Promise<void> {
    return this.enqueueTurn('auto-tick', async () => {
      if (this.stopped) return;
      if (!this.presetConfigured) return;

      for (const key of this.activatedAgents) {
        if (!this.agents.has(key)) {
          this.resetThreadCompactionState(key);
        }
      }

      const activeTargets = activeTargetsInput && activeTargetsInput.length > 0
        ? [...activeTargetsInput]
        : this.getAutoTickActiveTargets();
      if (activeTargets.length === 0) return;

      this.roundNumber++;
      const ctx = this.musicalContext;
      const audioFeedback = this.getFreshAudioFeedbackSection();

      console.log(`[AgentManager] Auto-tick round ${this.roundNumber}`);

      const responsePromises = activeTargets.map((key) => {
        this.applyPendingThreadCompactionForAutoTick(key);

        const bandStateLines = this.activatedAgents
          .filter((k) => k !== key)
          .map((k) => this.formatAgentBandState(k));

        const myPattern = this.agentPatterns[key] || 'silence';

        const context = buildAutoTickManagerContext({
          roundNumber: this.roundNumber,
          musicalContext: ctx,
          currentPattern: myPattern,
          bandStateLines,
          audioFeedback,
        });

        this.setAgentStatus(key, 'thinking');
        return this.sendToAgentAndCollect(key, context);
      });

      const responses = await Promise.all(responsePromises);
      const patternsBeforeTurn = { ...this.agentPatterns };

      // If stopped during await, don't apply stale responses
      if (this.stopped) return;

      for (let i = 0; i < activeTargets.length; i++) {
        const key = activeTargets[i];
        const response = responses[i];
        const patternBeforeTurn = this.agentPatterns[key] || 'silence';
        const acceptedResponse = this.applyAgentResponse(key, response, 'auto-tick');
        this.recordAutoTickCompactionSignal({
          key,
          acceptedResponse,
          patternBeforeTurn,
        });
        responses[i] = acceptedResponse;
      }

      // Aggregate autonomous context drift from agent decisions
      const autoTickDelta = this.applyModelRelativeContextDeltaForAutoTick(responses);
      if (autoTickDelta) {
        console.log('[AgentManager] Auto-tick context drift:', autoTickDelta);
      }
      const suggestionDelta = this.applyContextSuggestions(responses);
      if (suggestionDelta) {
        console.log('[AgentManager] Agent context suggestions applied:', suggestionDelta);
      }

      const changedAgents = this.computeChangedAgents(patternsBeforeTurn);
      this.composeAndBroadcast('auto-tick', changedAgents);
    });
  }

  // ─── Private: State Management ───────────────────────────────────

  private maybeRejectInvalidPattern(
    key: string,
    pattern: string,
    turnSource: JamTurnSource
  ): boolean {
    if (pattern === 'silence' || pattern === 'no_change') return false;

    const validation = validatePatternForJam(pattern);
    if (validation.valid) return false;

    const reason = validation.reason || 'invalid pattern syntax';
    const compactPattern = pattern.replace(/\s+/g, ' ').trim().slice(0, 200);
    console.warn(`[Agent:${key}] Invalid pattern rejected: ${reason}. Pattern: ${compactPattern}`);

    if (turnSource === 'directive') {
      const agentName = AGENT_META[key]?.name ?? key;
      this.broadcastWs('directive_error', {
        message: `${agentName} returned an invalid pattern (${reason}). Keeping the previous groove.`,
        targetAgent: key,
      });
    }

    return true;
  }

  private applyAgentResponse(
    key: string,
    response: AgentResponse | null,
    turnSource: JamTurnSource,
    turnContext: AgentTurnContext = {}
  ): AgentResponse | null {
    const state = this.agentStates[key];
    if (!state) return null;

    let safeResponse = response;
    if (safeResponse) {
      const proposedPattern = safeResponse.pattern || 'silence';
      if (this.maybeRejectInvalidPattern(key, proposedPattern, turnSource)) {
        safeResponse = null;
      }
    }

    if (safeResponse) {
      this.agentDecisions[key] = safeResponse.decision;
      const pattern = safeResponse.pattern || 'silence';

      // APM-14 contract: 'no_change' is a sentinel value meaning "keep my current
      // pattern playing". The agent's thoughts/commentary may still update, but
      // agentPatterns[key] is intentionally NOT overwritten. If no prior pattern
      // exists (first round edge case), falls back to 'silence'.
      if (pattern === 'no_change') {
        // Guard: can't hold what doesn't exist (first round)
        if (!this.agentPatterns[key] || this.agentPatterns[key] === '') {
          this.agentPatterns[key] = 'silence';
        }
        // Don't update agentPatterns — keep existing pattern playing
        this.agentStates[key] = {
          ...state,
          pattern: this.agentPatterns[key],
          thoughts: safeResponse.thoughts || '',
          status: this.agentPatterns[key] !== 'silence' ? 'playing' : 'idle',
          lastUpdated: new Date().toISOString(),
        };
        this.broadcastAgentThought(key, safeResponse);
        this.maybeBroadcastAgentCommentaryForTurn(key, safeResponse, turnSource, turnContext);
        this.setAgentStatus(key, this.agentStates[key].status);
        return safeResponse;
      }

      // Auto-tick silence guard: agents should not spontaneously go silent
      // during autonomous evolution. Only boss directives can silence an agent.
      const autoTickSilenceIntent = safeResponse.decision?.arrangement_intent;
      const autoTickSilenceConfidence = safeResponse.decision?.confidence;
      const allowsIntentionalAutoTickSilence = (
        autoTickSilenceConfidence === 'high'
        && (
          autoTickSilenceIntent === 'breakdown'
          || autoTickSilenceIntent === 'strip_back'
          || autoTickSilenceIntent === 'transition'
        )
      );

      if (
        turnSource === 'auto-tick' &&
        pattern === 'silence' &&
        this.agentPatterns[key] &&
        this.agentPatterns[key] !== '' &&
        this.agentPatterns[key] !== 'silence' &&
        !allowsIntentionalAutoTickSilence
      ) {
        console.warn(`[AgentManager] Auto-tick silence coerced to no_change for ${key}`);
        this.agentStates[key] = {
          ...state,
          thoughts: safeResponse.thoughts || '',
          status: 'playing',
          lastUpdated: new Date().toISOString(),
        };
        this.broadcastAgentThought(key, safeResponse);
        this.maybeBroadcastAgentCommentaryForTurn(key, safeResponse, turnSource, turnContext);
        this.setAgentStatus(key, this.agentStates[key].status);
        return safeResponse;
      }

      this.agentPatterns[key] = pattern;
      this.agentStates[key] = {
        ...state,
        pattern,
        fallbackPattern: pattern !== 'silence' ? pattern : state.fallbackPattern,
        thoughts: safeResponse.thoughts || '',
        status: pattern !== 'silence' ? 'playing' : 'idle',
        lastUpdated: new Date().toISOString(),
      };

      // Broadcast agent thought
      this.broadcastAgentThought(key, safeResponse);
      this.maybeBroadcastAgentCommentaryForTurn(key, safeResponse, turnSource, turnContext);
    } else {
      // APM-14 contract: when an agent times out (null response), the runtime
      // falls back to its last known good pattern (fallbackPattern) to maintain
      // musical continuity. Status is set to 'timeout' only if no fallback exists.
      this.agentPatterns[key] = state.fallbackPattern || 'silence';
      this.agentStates[key] = {
        ...state,
        status: (state.fallbackPattern && state.fallbackPattern !== 'silence') ? 'playing' : 'timeout',
        lastUpdated: new Date().toISOString(),
      };
      if (
        turnSource === 'directive'
        && turnContext.directiveTargetAgent === key
      ) {
        this.broadcastGuaranteedDirectiveCommentary(key);
      }
    }

    this.setAgentStatus(key, this.agentStates[key].status);
    return safeResponse;
  }

  private maybeBroadcastAgentCommentaryForTurn(
    key: string,
    response: AgentResponse,
    turnSource: JamTurnSource,
    turnContext: AgentTurnContext
  ): void {
    const targetedDirective = (
      turnSource === 'directive'
      && turnContext.directiveTargetAgent === key
    );
    if (targetedDirective) {
      this.broadcastGuaranteedDirectiveCommentary(key, response);
      return;
    }
    this.maybeBroadcastAgentCommentary(key, response, turnSource);
  }

  private broadcastGuaranteedDirectiveCommentary(
    key: string,
    response?: AgentResponse
  ): void {
    const commentary = this.sanitizeOptionalCommentary(response?.commentary)
      ?? this.sanitizeOptionalCommentary(response?.thoughts)
      ?? TARGETED_DIRECTIVE_EMPTY_COMMENTARY;
    const commentarySignature = this.buildCommentarySignature(commentary);
    const runtimeState = this.getAgentCommentaryRuntimeState(key);

    this.broadcastAgentCommentary(key, commentary);
    runtimeState.lastRound = this.roundNumber;
    if (commentarySignature) {
      runtimeState.recentSignatures = [
        ...runtimeState.recentSignatures,
        commentarySignature,
      ].slice(-JAM_GOVERNANCE.COMMENTARY_RECENT_SIGNATURE_WINDOW);
    }
  }

  private getAgentCommentaryRuntimeState(key: string): AgentCommentaryRuntimeState {
    if (!this.agentCommentaryState[key]) {
      this.agentCommentaryState[key] = {
        lastRound: null,
        recentSignatures: [],
      };
    }
    return this.agentCommentaryState[key];
  }

  private sanitizeOptionalCommentary(text: string | undefined): string | undefined {
    if (typeof text !== 'string') return undefined;
    const collapsed = text.replace(/\s+/g, ' ').trim();
    if (!collapsed) return undefined;
    if (collapsed.length <= JAM_GOVERNANCE.COMMENTARY_MAX_CHARS) return collapsed;
    return collapsed.slice(0, JAM_GOVERNANCE.COMMENTARY_MAX_CHARS).trimEnd();
  }

  private buildCommentarySignature(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private maybeBroadcastAgentCommentary(
    key: string,
    response: AgentResponse,
    turnSource: JamTurnSource
  ): void {
    const commentary = this.sanitizeOptionalCommentary(response.commentary);
    if (!commentary) return;

    const commentarySignature = this.buildCommentarySignature(commentary);
    if (!commentarySignature) return;

    const thoughtSignature = this.buildCommentarySignature(
      this.sanitizeOptionalCommentary(response.thoughts) ?? ''
    );
    if (thoughtSignature && commentarySignature === thoughtSignature) return;

    const runtimeState = this.getAgentCommentaryRuntimeState(key);
    if (runtimeState.recentSignatures.includes(commentarySignature)) return;

    if (
      turnSource === 'auto-tick'
      && runtimeState.lastRound !== null
      && (this.roundNumber - runtimeState.lastRound) < JAM_GOVERNANCE.COMMENTARY_AUTO_TICK_MIN_ROUNDS
    ) {
      return;
    }

    this.broadcastAgentCommentary(key, commentary);
    runtimeState.lastRound = this.roundNumber;
    runtimeState.recentSignatures = [
      ...runtimeState.recentSignatures,
      commentarySignature,
    ].slice(-JAM_GOVERNANCE.COMMENTARY_RECENT_SIGNATURE_WINDOW);
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
    const patterns = this.activatedAgents
      .filter((k) => !this.mutedAgents.has(k))
      .map((k) => this.agentPatterns[k])
      .filter((p) => p && p !== 'silence');

    if (patterns.length === 0) return 'silence';
    if (patterns.length === 1) return patterns[0];
    return `stack(${patterns.join(', ')})`;
  }

  private normalizePatternForChangeDiff(pattern: string | undefined): string {
    return pattern && pattern.length > 0 ? pattern : 'silence';
  }

  private computeChangedAgents(previousPatterns: Record<string, string>): string[] {
    const candidateMap: Record<string, true> = {};
    for (const key of Object.keys(this.agentPatterns)) {
      candidateMap[key] = true;
    }
    for (const key of Object.keys(previousPatterns)) {
      candidateMap[key] = true;
    }

    const candidates = Object.keys(candidateMap);
    const changedAgents: string[] = [];

    for (const key of candidates) {
      const previousPattern = this.normalizePatternForChangeDiff(previousPatterns[key]);
      const nextPattern = this.normalizePatternForChangeDiff(this.agentPatterns[key]);
      if (previousPattern !== nextPattern) {
        changedAgents.push(key);
      }
    }

    return changedAgents;
  }

  private broadcastJamStateOnly(turnSource: JamTurnSource = 'staged-silent'): void {
    const combinedPattern = this.composePatterns();
    this.broadcastJamStatePayload(combinedPattern, turnSource);
  }

  private composeAndBroadcast(
    turnSource: JamTurnSource,
    changedAgents: string[] = []
  ): void {
    const combinedPattern = this.composePatterns();

    // Execute the composed pattern
    this.broadcastWs('execute', {
      code: combinedPattern,
      sessionId: this.sessionId,
      round: this.roundNumber,
      turnSource,
      changedAgents,
      changed: changedAgents.length > 0,
      issuedAtMs: Date.now(),
    });

    this.broadcastJamStatePayload(combinedPattern, turnSource);
  }

  private broadcastJamStatePayload(combinedPattern: string, turnSource?: JamTurnSource): void {
    // Broadcast full jam state
    const jamState = this.getJamStateSnapshot();

    const payload: JamStatePayload = {
      jamState,
      combinedPattern,
      ...(turnSource ? { turnSource } : {}),
    };

    this.broadcastWs<JamStatePayload>('jam_state_update', {
      ...payload,
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
      pattern: response.pattern,
      timestamp: new Date().toISOString(),
    });
  }

  private broadcastAgentCommentary(key: string, text: string): void {
    const meta = AGENT_META[key];
    if (!meta) return;

    this.broadcastWs<AgentCommentaryPayload>('agent_commentary', {
      agent: key,
      emoji: meta.emoji,
      text,
      timestamp: new Date().toISOString(),
    });
  }

  private isExplicitMuteDirective(text: string): boolean {
    const normalized = text.trim().toLowerCase();
    if (!normalized) return false;

    // Prevent false positives (e.g. "unmute" contains "mute")
    if (/\bunmute\b/.test(normalized)) return false;

    return (
      /\bmute\b/.test(normalized)
      || /\bgo silent\b/.test(normalized)
      || /\bstop playing\b/.test(normalized)
      || /\bdrop out\b/.test(normalized)
      || /\blay out\b/.test(normalized)
      || /\bsit out\b/.test(normalized)
    );
  }

  private coerceResponseToForcedSilence(response: AgentResponse | null): AgentResponse {
    if (!response) {
      return {
        pattern: 'silence',
        thoughts: 'Muting for the boss.',
      };
    }

    return {
      ...response,
      pattern: 'silence',
      // Muting is a deterministic transport command; ignore model-proposed
      // global-context drift when the boss explicitly asks an agent to mute.
      decision: undefined,
    };
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
