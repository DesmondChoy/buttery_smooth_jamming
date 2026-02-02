export interface ChatMessage {
  id: string;
  text: string;
  timestamp: Date;
}

// WebSocket message types
export type WSMessageType = 'execute' | 'stop' | 'message';

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
