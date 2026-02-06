export interface ChatMessage {
  id: string;
  text: string;
  timestamp: Date;
  sender: 'user' | 'assistant';
}

// WebSocket message types
export type WSMessageType = 'execute' | 'stop' | 'message' | 'user_message';

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
  status: 'idle' | 'thinking' | 'error' | 'timeout';
}

export interface JamState {
  sessionId: string;
  currentRound: number;
  musicalContext: MusicalContext;
  agents: Record<string, AgentState>;
}
