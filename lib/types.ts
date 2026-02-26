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
  | 'agent_thought'
  | 'agent_commentary'
  | 'musical_context_update'
  | 'agent_status'
  | 'start_jam'
  | 'directive_error';

export interface WSMessage<T = unknown> {
  type: WSMessageType;
  payload: T;
}

export interface ExecutePayload {
  code: string;
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

export interface AgentCommentaryPayload {
  agent: string;
  emoji: string;
  text: string;
  timestamp: string;
}

export interface JamStatePayload {
  jamState: JamState;
  combinedPattern: string;
}

export interface AgentStatusPayload {
  agent: string;
  status: 'idle' | 'thinking' | 'playing' | 'error' | 'timeout';
}

export interface MusicalContextPayload {
  musicalContext: MusicalContext;
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
  melody: { key: 'melody', name: 'ARIA',   emoji: '🎹', mention: '@ARIA',   colors: { border: 'border-purple-500/50', accent: 'text-purple-400', bg: 'bg-purple-500/10', bgSolid: 'bg-purple-900/50' } },
  chords: { key: 'chords', name: 'CHORDS', emoji: '🎼', mention: '@CHORDS', colors: { border: 'border-green-500/50',  accent: 'text-green-400',  bg: 'bg-green-500/10',  bgSolid: 'bg-green-900/50' } },
};
