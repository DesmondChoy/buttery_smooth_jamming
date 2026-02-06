'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  ChatMessage,
  WSMessage,
  ExecutePayload,
  MessagePayload,
  AgentThoughtPayload,
  AgentStatusPayload,
  MusicalContextPayload,
  JamStatePayload,
} from '@/lib/types';

export interface UseWebSocketOptions {
  url?: string;
  onExecute?: (code: string) => void;
  onStop?: () => void;
  onMessage?: (message: ChatMessage) => void;
  // Jam session callbacks
  onAgentThought?: (payload: AgentThoughtPayload) => void;
  onAgentStatus?: (payload: AgentStatusPayload) => void;
  onMusicalContextUpdate?: (payload: MusicalContextPayload) => void;
  onJamStateUpdate?: (payload: JamStatePayload) => void;
}

export interface UseWebSocketReturn {
  isConnected: boolean;
  error: string | null;
  sendMessage: (text: string) => void;
}

function getDefaultWsUrl(): string {
  if (typeof window === 'undefined') {
    return 'ws://localhost:3000/api/ws';
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/ws`;
}

export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const {
    url = getDefaultWsUrl(),
    onExecute, onStop, onMessage,
    onAgentThought, onAgentStatus, onMusicalContextUpdate, onJamStateUpdate,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Store callbacks in refs to avoid reconnecting when they change
  const onExecuteRef = useRef(onExecute);
  const onStopRef = useRef(onStop);
  const onMessageRef = useRef(onMessage);
  const onAgentThoughtRef = useRef(onAgentThought);
  const onAgentStatusRef = useRef(onAgentStatus);
  const onMusicalContextUpdateRef = useRef(onMusicalContextUpdate);
  const onJamStateUpdateRef = useRef(onJamStateUpdate);

  useEffect(() => {
    onExecuteRef.current = onExecute;
    onStopRef.current = onStop;
    onMessageRef.current = onMessage;
    onAgentThoughtRef.current = onAgentThought;
    onAgentStatusRef.current = onAgentStatus;
    onMusicalContextUpdateRef.current = onMusicalContextUpdate;
    onJamStateUpdateRef.current = onJamStateUpdate;
  }, [onExecute, onStop, onMessage, onAgentThought, onAgentStatus, onMusicalContextUpdate, onJamStateUpdate]);

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message = JSON.parse(event.data) as WSMessage;

      switch (message.type) {
        case 'execute': {
          const payload = message.payload as ExecutePayload;
          onExecuteRef.current?.(payload.code);
          break;
        }
        case 'stop': {
          onStopRef.current?.();
          break;
        }
        case 'message': {
          const payload = message.payload as MessagePayload;
          const chatMessage: ChatMessage = {
            id: payload.id,
            text: payload.text,
            timestamp: new Date(payload.timestamp),
            sender: 'assistant',
          };
          onMessageRef.current?.(chatMessage);
          break;
        }
        case 'agent_thought': {
          const payload = message.payload as AgentThoughtPayload;
          onAgentThoughtRef.current?.(payload);
          break;
        }
        case 'agent_status': {
          const payload = message.payload as AgentStatusPayload;
          onAgentStatusRef.current?.(payload);
          break;
        }
        case 'musical_context_update': {
          const payload = message.payload as MusicalContextPayload;
          onMusicalContextUpdateRef.current?.(payload);
          break;
        }
        case 'jam_state_update': {
          const payload = message.payload as JamStatePayload;
          onJamStateUpdateRef.current?.(payload);
          break;
        }
        default:
          console.warn('Unknown WebSocket message type:', message.type);
      }
    } catch (err) {
      console.error('Failed to parse WebSocket message:', err);
    }
  }, []);

  useEffect(() => {
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    ws.onclose = () => {
      setIsConnected(false);
    };

    ws.onerror = () => {
      setError('WebSocket connection error');
      setIsConnected(false);
    };

    ws.onmessage = handleMessage;

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [url, handleMessage]);

  const sendMessage = useCallback((text: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const payload: MessagePayload = {
        id: crypto.randomUUID(),
        text,
        timestamp: new Date().toISOString(),
      };
      wsRef.current.send(JSON.stringify({ type: 'user_message', payload }));
    }
  }, []);

  return { isConnected, error, sendMessage };
}
