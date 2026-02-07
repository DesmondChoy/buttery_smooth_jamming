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
  | 'musical_context_update'
  | 'agent_status'
  | 'jam_tick';

export interface WSMessage<T = unknown> {
  type: WSMessageType;
  payload: T;
}

export interface ExecutePayload {
  code: string;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface StopPayload {}

export interface MessagePayload {
  id: string;
  text: string;
  timestamp: string;
}

export interface AgentThoughtPayload {
  agent: string;
  emoji: string;
  thought: string;
  reaction: string;
  pattern: string;
  compliedWithBoss: boolean;
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
  key: string;
  scale: string[];
  chordProgression: string[];
  bpm: number;
  timeSignature: string;
  energy: number;
}

export interface AgentState {
  name: string;
  emoji: string;
  pattern: string;
  fallbackPattern: string;
  thoughts: string;
  reaction: string;
  lastUpdated: string;
  status: 'idle' | 'thinking' | 'playing' | 'error' | 'timeout';
}

export interface JamState {
  sessionId: string;
  currentRound: number;
  musicalContext: MusicalContext;
  agents: Record<string, AgentState>;
}

export interface JamChatMessage {
  id: string;
  type: 'agent_thought' | 'agent_reaction' | 'boss_directive' | 'system';
  agent?: string;          // 'drums' | 'bass' | 'melody' | 'fx'
  agentName?: string;      // 'BEAT' | 'GROOVE' | 'ARIA' | 'GLITCH'
  emoji?: string;
  text: string;
  pattern?: string;        // optional code snippet
  compliedWithBoss?: boolean;
  round: number;
  timestamp: Date;
}
