'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  ChatMessage,
  WSMessage,
  ExecutePayload,
  MessagePayload,
  AgentThoughtPayload,
  AgentCommentaryPayload,
  AgentStatusPayload,
  MusicalContextPayload,
  JamStatePayload,
} from '@/lib/types';

export interface UseWebSocketOptions {
  url?: string;
  onExecute?: (payload: ExecutePayload) => void;
  onStop?: () => void;
  onMessage?: (message: ChatMessage) => void;
  // Jam session callbacks
  onAgentThought?: (payload: AgentThoughtPayload) => void;
  onAgentCommentary?: (payload: AgentCommentaryPayload) => void;
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
    onAgentThought, onAgentCommentary, onAgentStatus, onMusicalContextUpdate, onJamStateUpdate,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const shouldReconnectRef = useRef(true);
  const connectRef = useRef<(() => void) | null>(null);
  const MAX_RECONNECT_ATTEMPTS = 8;

  // Store callbacks in refs to avoid reconnecting when they change
  const onExecuteRef = useRef(onExecute);
  const onStopRef = useRef(onStop);
  const onMessageRef = useRef(onMessage);
  const onAgentThoughtRef = useRef(onAgentThought);
  const onAgentCommentaryRef = useRef(onAgentCommentary);
  const onAgentStatusRef = useRef(onAgentStatus);
  const onMusicalContextUpdateRef = useRef(onMusicalContextUpdate);
  const onJamStateUpdateRef = useRef(onJamStateUpdate);

  const normalizeExecutePayload = useCallback((rawPayload: unknown): ExecutePayload | null => {
    if (typeof rawPayload === 'string') {
      return { code: rawPayload };
    }

    if (rawPayload && typeof rawPayload === 'object' && 'code' in rawPayload) {
      const maybeCode = (rawPayload as { code?: unknown }).code;
      if (typeof maybeCode === 'string') {
        return rawPayload as ExecutePayload;
      }
    }

    return null;
  }, []);

  useEffect(() => {
    onExecuteRef.current = onExecute;
    onStopRef.current = onStop;
    onMessageRef.current = onMessage;
    onAgentThoughtRef.current = onAgentThought;
    onAgentCommentaryRef.current = onAgentCommentary;
    onAgentStatusRef.current = onAgentStatus;
    onMusicalContextUpdateRef.current = onMusicalContextUpdate;
    onJamStateUpdateRef.current = onJamStateUpdate;
  }, [onExecute, onStop, onMessage, onAgentThought, onAgentCommentary, onAgentStatus, onMusicalContextUpdate, onJamStateUpdate]);

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message = JSON.parse(event.data) as WSMessage;

      switch (message.type) {
        case 'execute': {
          const rawPayload = message.payload as unknown;
          const payload = normalizeExecutePayload(rawPayload);
          if (payload) {
            onExecuteRef.current?.(payload);
          }
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
        case 'agent_commentary': {
          const payload = message.payload as AgentCommentaryPayload;
          onAgentCommentaryRef.current?.(payload);
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
        case 'auto_tick_fired':
          // Reserved for future UI/diagnostic consumers.
          break;
        default:
          console.warn('Unknown WebSocket message type:', message.type);
      }
    } catch (err) {
      console.error('Failed to parse WebSocket message:', err);
    }
  }, [normalizeExecutePayload]);

  const connect = useCallback(() => {
    if (!shouldReconnectRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      reconnectAttemptsRef.current = 0;
      setIsConnected(true);
      setError(null);
    };

    ws.onclose = () => {
      setIsConnected(false);

      if (!shouldReconnectRef.current) return;
      if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
        setError('Execution WebSocket disconnected. Please refresh the page.');
        return;
      }

      const delay = Math.min(3000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
      reconnectAttemptsRef.current += 1;
      reconnectTimeoutRef.current = setTimeout(() => {
        connectRef.current?.();
      }, delay);
    };

    ws.onerror = () => {
      setError('WebSocket connection error');
      setIsConnected(false);
    };

    ws.onmessage = handleMessage;
  }, [url, handleMessage]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    shouldReconnectRef.current = true;
    connect();

    return () => {
      shouldReconnectRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

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
