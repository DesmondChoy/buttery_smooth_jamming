'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  ChatMessage,
  WSMessage,
  ExecutePayload,
  MessagePayload,
} from '@/lib/types';

export interface UseWebSocketOptions {
  url?: string;
  onExecute?: (code: string) => void;
  onStop?: () => void;
  onMessage?: (message: ChatMessage) => void;
}

export interface UseWebSocketReturn {
  isConnected: boolean;
  error: string | null;
  sendMessage: (text: string) => void;
}

const DEFAULT_WS_URL = 'ws://localhost:3000/api/ws';

export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const { url = DEFAULT_WS_URL, onExecute, onStop, onMessage } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Store callbacks in refs to avoid reconnecting when they change
  const onExecuteRef = useRef(onExecute);
  const onStopRef = useRef(onStop);
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onExecuteRef.current = onExecute;
    onStopRef.current = onStop;
    onMessageRef.current = onMessage;
  }, [onExecute, onStop, onMessage]);

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
