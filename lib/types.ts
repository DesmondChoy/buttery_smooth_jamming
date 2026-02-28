export interface ChatMessage {
  id: string;
  text: string;
  timestamp: Date;
  sender: 'user' | 'assistant';
}

// WebSocket message types
export type WSMessageType =
  | 'execute' | 'stop' | 'message' | 'user_message'
  | 'jam_state_update'
  | 'auto_tick_timing_update'
  | 'auto_tick_fired'
  | 'agent_thought'
  | 'agent_commentary'
  | 'musical_context_update'
  | 'agent_status'
  | 'start_jam'
  | 'audio_feedback'
  | 'directive_error';

export interface WSMessage<T = unknown> {
  type: WSMessageType;
  payload: T;
}

export interface ExecutePayload {
  code: string;
  sessionId?: string;
  round?: number;
  turnSource?: JamTurnSource;
  changedAgents?: string[];
  changed?: boolean;
  issuedAtMs?: number;
}

export interface MessagePayload {
  id: string;
  text: string;
  timestamp: string;
}

export interface AgentThoughtPayload {
  agent: string;
  emoji: string;
  thought: string;
  pattern: string;
  timestamp: string;
}

export type JamTurnSource = 'jam-start' | 'directive' | 'auto-tick' | 'staged-silent';

export interface AgentCommentaryPayload {
  agent: string;
  emoji: string;
  text: string;
  timestamp: string;
}

export interface JamStatePayload {
  jamState: JamState;
  combinedPattern: string;
  turnSource?: JamTurnSource;
  diagnostics?: JamStateDiagnostics;
}

export interface AutoTickTimingPayload {
  autoTick: AutoTickTiming;
}

export interface AutoTickFiredPayload {
  sessionId: string;
  round: number;
  activeAgents: string[];
  autoTick: AutoTickTiming;
  firedAtMs: number;
}

export interface AgentStatusPayload {
  agent: string;
  status: 'idle' | 'thinking' | 'playing' | 'error' | 'timeout';
}

export interface MusicalContextPayload {
  musicalContext: MusicalContext;
}

export type JamAgentKey = 'drums' | 'bass' | 'melody' | 'chords';

export interface CameraMotionVector {
  score: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  centroidX: number;
  centroidY: number;
  maxDelta: number;
}

export interface CameraFaceSnapshot {
  present: boolean;
  motion: number;
  areaRatio: number;
  stability: number;
  box?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface CameraVisionSample {
  capturedAtMs: number;
  sampleIntervalMs: number;
  frameWidth: number;
  frameHeight: number;
  motion: CameraMotionVector;
  isStale?: boolean;
  face?: CameraFaceSnapshot;
}

export interface CameraDirectivePayload {
  sample: CameraVisionSample;
}

export interface InterpretedVisionDirective {
  directive: string;
  targetAgent?: JamAgentKey;
  confidence: number;
  rationale?: string;
}

export type ConductorInterpreterReason =
  | 'interpreted'
  | 'below_confidence_threshold'
  | 'stale_sample'
  | 'model_parse_failure'
  | 'model_execution_failure'
  | 'invalid_request'
  | 'invalid_payload';

export interface ConductorInterpreterDiagnostics {
  model_exit_code?: number | null;
  model_exit_signal?: string | null;
  model_timed_out?: boolean;
  parse_error?: string;
  raw_sample_timestamp_ms?: number;
  payload_sample_interval_ms?: number;
}

export interface ConductorInterpreterResult {
  accepted: boolean;
  confidence: number;
  reason: ConductorInterpreterReason | string;
  explicit_target: JamAgentKey | null;
  interpretation?: {
    directive: string;
    rationale?: string;
    target_agent?: JamAgentKey;
  };
  rejected_reason?: string;
  diagnostics?: ConductorInterpreterDiagnostics;
}

// Jam session types (multi-agent band)

export interface MusicalContext {
  genre: string;
  key: string;
  scale: string[];
  chordProgression: string[];
  bpm: number;
  timeSignature: string;
  energy: number;
}

export type DecisionConfidence = 'low' | 'medium' | 'high';

export type ArrangementIntent =
  | 'build'
  | 'breakdown'
  | 'drop'
  | 'strip_back'
  | 'bring_forward'
  | 'hold'
  | 'no_change'
  | 'transition';

export interface StructuredMusicalDecision {
  tempo_delta_pct?: number;
  energy_delta?: number;
  arrangement_intent?: ArrangementIntent;
  confidence?: DecisionConfidence;
  suggested_key?: string;           // e.g. "Eb major"
  suggested_chords?: string[];      // e.g. ["Am", "F", "C", "G"]
}

export interface AgentState {
  name: string;
  emoji: string;
  pattern: string;
  fallbackPattern: string;
  thoughts: string;
  lastUpdated: string;
  status: 'idle' | 'thinking' | 'playing' | 'error' | 'timeout';
}

export interface JamState {
  sessionId: string;
  currentRound: number;
  musicalContext: MusicalContext;
  agents: Record<string, AgentState>;
  activeAgents: string[];
  activatedAgents: string[];
  mutedAgents: string[];
  autoTick?: AutoTickTiming;
}

export interface AutoTickTiming {
  intervalMs: number;
  nextTickAtMs: number | null;
  serverNowMs: number;
}

export interface JamChatMessage {
  id: string;
  type: 'agent_thought' | 'agent_commentary' | 'boss_directive' | 'system';
  agent?: string;          // 'drums' | 'bass' | 'melody' | 'chords'
  agentName?: string;      // 'BEAT' | 'GROOVE' | 'ARIA' | 'CHORDS'
  emoji?: string;
  text: string;
  pattern?: string;        // optional code snippet
  targetAgent?: string;    // @mention-directed boss directive target
  timestamp: Date;
}

export interface AudioFeatureSnapshot {
  capturedAtMs: number;
  windowMs: number;
  loudnessDb: number;
  spectralCentroidHz: number;
  lowBandEnergy: number;
  midBandEnergy: number;
  highBandEnergy: number;
  spectralFlux: number;
  onsetDensity: number;
}

export type AudioContextLevel = 'low' | 'medium' | 'high';

export type AudioContextTexture = 'dark' | 'neutral' | 'bright';

export type AudioContextMotion = 'static' | 'moving';

export type AudioContextConfidence = 'high' | 'medium' | 'low';

export type AudioContextState = 'analysis available' | 'fallback: music context only';

export interface AudioContextSummary {
  level: AudioContextLevel;
  texture: AudioContextTexture;
  motion: AudioContextMotion;
  confidence: AudioContextConfidence;
  state: AudioContextState;
}

export type AgentTurnOutcome =
  | 'accepted'
  | 'rejected_or_failed'
  | 'empty_or_unparseable'
  | 'missing_agent';

export interface AgentContextBandStateEntry {
  agent: string;
  line: string;
  pattern: string;
  patternSummary: string | null;
}

export interface AgentRawPromptSnapshot {
  scope: 'full_prompt';
  text: string;
  originalCharCount: number;
  maxChars: number;
  truncated: boolean;
}

export interface AgentTurnThreadState {
  invocationMode: 'resume' | 'new_thread';
  threadIdBefore: string | null;
  threadIdAfter: string | null;
  pendingCompactionBefore: boolean;
  pendingCompactionAfter: boolean;
  noChangeStreakBefore: number;
  noChangeStreakAfter: number;
  compactionAppliedThisTurn: boolean;
}

export interface AgentContextTurnSnapshot {
  id: string;
  round: number;
  turnSource: JamTurnSource;
  createdAt: string;
  directive?: string;
  targetAgent?: string;
  isBroadcastDirective?: boolean;
  musicalContext: MusicalContext;
  currentPattern: string;
  currentPatternSummary: string | null;
  bandState: AgentContextBandStateEntry[];
  audioFeedback?: AudioFeatureSnapshot;
  audioContextSummary?: AudioContextSummary;
  managerContext: string;
  rawPrompt: AgentRawPromptSnapshot;
  outcome: AgentTurnOutcome;
  thread: AgentTurnThreadState;
}

export interface AgentThreadCompactionEvent {
  appliedAtRound: number;
  turnSource: JamTurnSource;
  oldThreadId: string | null;
  timestamp: string;
}

export interface AgentContextWindow {
  agent: string;
  updatedAt: string;
  turns: AgentContextTurnSnapshot[];
  lastCompaction?: AgentThreadCompactionEvent;
}

export interface JamStateDiagnostics {
  agentContextWindowsDelta: Record<string, AgentContextWindow>;
}

// Pattern parser types — structured summary of agent Strudel patterns
export interface PatternSummary {
  structure: 'single' | 'stack';
  layers: LayerSummary[];
}

export interface LayerSummary {
  source: 'note' | 's';
  content: string[];          // leaf values from mini notation
  effects: Record<string, number | string>;  // gain, lpf, bank, etc.
  modifiers: string[];        // "sometimes", "every(4)", etc.
}

// Consolidated agent metadata — single source of truth for names, emojis, colors
export const AGENT_META: Record<string, {
  key: string;
  name: string;
  emoji: string;
  mention: string;
  colors: { border: string; accent: string; bg: string; bgSolid: string };
}> = {
  drums:  { key: 'drums',  name: 'BEAT',   emoji: '🥁', mention: '@BEAT',   colors: { border: 'border-red-500/50',    accent: 'text-red-400',    bg: 'bg-red-500/10',    bgSolid: 'bg-red-900/50' } },
  bass:   { key: 'bass',   name: 'GROOVE', emoji: '🎸', mention: '@GROOVE', colors: { border: 'border-blue-500/50',   accent: 'text-blue-400',   bg: 'bg-blue-500/10',   bgSolid: 'bg-blue-900/50' } },
  melody: { key: 'melody', name: 'ARIA',   emoji: '🎹', mention: '@ARIA',   colors: { border: 'border-gray-400/50', accent: 'text-gray-200', bg: 'bg-gray-500/10', bgSolid: 'bg-gray-900/50' } },
  chords: { key: 'chords', name: 'CHORDS', emoji: '🎼', mention: '@CHORDS', colors: { border: 'border-fuchsia-500/50',  accent: 'text-fuchsia-400',  bg: 'bg-fuchsia-500/10',  bgSolid: 'bg-fuchsia-900/50' } },
};
