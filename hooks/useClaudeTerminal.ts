'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export type ClaudeStatus = 'connecting' | 'ready' | 'thinking' | 'done' | 'error';

interface ServerMessage {
  type: 'text' | 'tool_use' | 'tool_result' | 'status' | 'error' | 'pong';
  text?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  status?: ClaudeStatus;
  error?: string;
}

export interface TerminalLine {
  id: string;
  type: 'user' | 'assistant' | 'tool' | 'status' | 'error';
  text: string;
  timestamp: Date;
}

interface UseClaudeTerminalOptions {
  url?: string;
  onToolUse?: (toolName: string, toolInput: Record<string, unknown>) => void;
}

interface UseClaudeTerminalReturn {
  lines: TerminalLine[];
  status: ClaudeStatus;
  isConnected: boolean;
  error: string | null;
  sendMessage: (text: string) => void;
  clearLines: () => void;
}

function getDefaultWsUrl(): string {
  if (typeof window === 'undefined') {
    return 'ws://localhost:3000/api/claude-ws';
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/claude-ws`;
}

export function useClaudeTerminal(
  options: UseClaudeTerminalOptions = {}
): UseClaudeTerminalReturn {
  const { url = getDefaultWsUrl(), onToolUse } = options;

  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [status, setStatus] = useState<ClaudeStatus>('connecting');
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const onToolUseRef = useRef(onToolUse);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentAssistantLineRef = useRef<string | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const handleMessageRef = useRef<((event: MessageEvent) => void) | null>(null);
  const MAX_RECONNECT_ATTEMPTS = 5;

  useEffect(() => {
    onToolUseRef.current = onToolUse;
  }, [onToolUse]);

  const addLine = useCallback((type: TerminalLine['type'], text: string) => {
    const line: TerminalLine = {
      id: crypto.randomUUID(),
      type,
      text,
      timestamp: new Date(),
    };
    setLines((prev) => [...prev, line]);
    return line.id;
  }, []);

  const appendToLine = useCallback((lineId: string, text: string) => {
    setLines((prev) =>
      prev.map((line) =>
        line.id === lineId ? { ...line, text: line.text + text } : line
      )
    );
  }, []);

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data) as ServerMessage;

        switch (message.type) {
          case 'text':
            if (message.text) {
              // Stream text to current assistant line or create new one
              if (currentAssistantLineRef.current) {
                appendToLine(currentAssistantLineRef.current, message.text);
              } else {
                currentAssistantLineRef.current = addLine('assistant', message.text);
              }
            }
            break;

          case 'tool_use':
            // Complete current assistant line
            currentAssistantLineRef.current = null;

            if (message.toolName) {
              const inputStr = message.toolInput
                ? JSON.stringify(message.toolInput, null, 2)
                : '';
              addLine('tool', `[${message.toolName}] ${inputStr.substring(0, 200)}${inputStr.length > 200 ? '...' : ''}`);
              onToolUseRef.current?.(message.toolName, message.toolInput || {});
            }
            break;

          case 'tool_result':
            if (message.text) {
              addLine('tool', `Result: ${message.text.substring(0, 100)}${message.text.length > 100 ? '...' : ''}`);
            }
            break;

          case 'status':
            if (message.status) {
              setStatus(message.status);
              if (message.status === 'done') {
                // Reset for next message
                currentAssistantLineRef.current = null;
              }
              if (message.status === 'ready' && !isConnected) {
                addLine('status', 'Claude is ready. Type your request below.');
              }
            }
            break;

          case 'error':
            currentAssistantLineRef.current = null;
            if (message.error) {
              setError(message.error);
              addLine('error', message.error);
            }
            break;

          case 'pong':
            // Heartbeat response, ignore
            break;
        }
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    },
    // Note: isConnected is intentionally NOT in deps to prevent reconnection loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addLine, appendToLine]
  );

  // Keep handleMessage in a ref to avoid recreating connect
  useEffect(() => {
    handleMessageRef.current = handleMessage;
  }, [handleMessage]);

  const connectRef = useRef<() => void>();

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setError(null);
      setStatus('connecting');
      reconnectAttemptsRef.current = 0; // Reset on successful connection
    };

    ws.onclose = () => {
      setIsConnected(false);
      setStatus('error');
      currentAssistantLineRef.current = null;

      // Auto-reconnect with exponential backoff, up to max attempts
      if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        const delay = Math.min(3000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
        reconnectAttemptsRef.current += 1;
        reconnectTimeoutRef.current = setTimeout(() => {
          connectRef.current?.();
        }, delay);
      } else {
        setError('Connection failed after multiple attempts. Please refresh the page.');
      }
    };

    ws.onerror = () => {
      setError('WebSocket connection error');
      setIsConnected(false);
    };

    ws.onmessage = (event) => {
      handleMessageRef.current?.(event);
    };
  }, [url]); // Only depend on url, use refs for callbacks

  // Keep the ref updated with the latest connect function
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  // Heartbeat to keep connection alive
  useEffect(() => {
    const interval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const sendMessage = useCallback((text: string) => {
    if (!text.trim()) return;

    // Add user message to display
    addLine('user', text);
    currentAssistantLineRef.current = null;

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'user_input', text }));
      setStatus('thinking');
    } else {
      addLine('error', 'Not connected to Claude. Reconnecting...');
      connect();
    }
  }, [addLine, connect]);

  const clearLines = useCallback(() => {
    setLines([]);
    currentAssistantLineRef.current = null;
  }, []);

  return {
    lines,
    status,
    isConnected,
    error,
    sendMessage,
    clearLines,
  };
}
