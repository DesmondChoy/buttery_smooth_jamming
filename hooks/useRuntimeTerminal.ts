'use client';

import type { AudioFeatureSnapshot } from '@/lib/types';
import type { ConductorInterpreterResult } from '@/lib/types';
import type { CameraDirectivePayload } from '@/lib/types';
import type { JamAgentKey } from '@/lib/types';

import { useState, useEffect, useRef, useCallback } from 'react';

export type RuntimeStatus = 'connecting' | 'ready' | 'thinking' | 'done' | 'error';
export type AiStatus = RuntimeStatus;
export type CodexStatus = RuntimeStatus;

export interface TerminalLine {
  id: string;
  type: 'user' | 'assistant' | 'tool' | 'status' | 'error';
  text: string;
  timestamp: Date;
}

export interface UseRuntimeTerminalOptions {
  url?: string;
  onToolUse?: (toolName: string, toolInput: Record<string, unknown>) => void;
  onJamBroadcast?: (message: { type: string; payload: unknown }) => void;
  onConductorIntent?: (result: ConductorInterpreterResult) => void;
}

export interface UseRuntimeTerminalReturn {
  lines: TerminalLine[];
  status: RuntimeStatus;
  isConnected: boolean;
  error: string | null;
  sendMessage: (text: string) => void;
  sendStartJam: (activeAgents: string[]) => void;
  sendJamPreset: (presetId: string) => void;
  sendBossDirective: (text: string, targetAgent?: string, activeAgents?: string[]) => void;
  sendStopJam: () => void;
  setContextInspectorEnabled: (enabled: boolean) => void;
  sendAudioFeedback: (payload: AudioFeatureSnapshot) => void;
  sendCameraDirective: (payload: CameraDirectivePayload, activeAgents?: string[]) => void;
  clearLines: () => void;
}

export type UseCodexTerminalOptions = UseRuntimeTerminalOptions;
export type UseCodexTerminalReturn = UseRuntimeTerminalReturn;
export type UseAiTerminalOptions = UseRuntimeTerminalOptions;
export type UseAiTerminalReturn = UseRuntimeTerminalReturn;

const CONDUCTOR_INTENT_AGENT_KEYS = new Set(['drums', 'bass', 'melody', 'chords'] as const);

function isConductorAgentKey(value: unknown): value is JamAgentKey {
  return typeof value === 'string' && CONDUCTOR_INTENT_AGENT_KEYS.has(value as JamAgentKey);
}

function getDefaultWsUrl(): string {
  if (typeof window === 'undefined') {
    return 'ws://localhost:3000/api/ai-ws';
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/ai-ws`;
}

export function useRuntimeTerminal(
  options: UseRuntimeTerminalOptions = {}
): UseRuntimeTerminalReturn {
  const {
    url = getDefaultWsUrl(),
    onToolUse,
    onJamBroadcast,
    onConductorIntent,
  } = options;

  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [status, setStatus] = useState<RuntimeStatus>('connecting');
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const onToolUseRef = useRef(onToolUse);
  const onJamBroadcastRef = useRef(onJamBroadcast);
  const onConductorIntentRef = useRef(onConductorIntent);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentAssistantLineRef = useRef<string | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const handleMessageRef = useRef<((event: MessageEvent) => void) | null>(null);
  const contextInspectorEnabledRef = useRef(false);
  const shouldReconnectRef = useRef(true);
  const MAX_RECONNECT_ATTEMPTS = 5;

  useEffect(() => {
    onToolUseRef.current = onToolUse;
    onJamBroadcastRef.current = onJamBroadcast;
    onConductorIntentRef.current = onConductorIntent;
  }, [onToolUse, onJamBroadcast, onConductorIntent]);

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
        const message = JSON.parse(event.data);

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
                addLine('status', 'Runtime is ready. Type your request below.');
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

          // Jam session messages from AgentProcessManager
          case 'agent_thought':
          case 'agent_commentary':
          case 'agent_status':
          case 'execute':
          case 'jam_state_update':
          case 'auto_tick_timing_update':
          case 'auto_tick_fired':
          case 'directive_error':
            onJamBroadcastRef.current?.(message);
            break;

          case 'conductor_intent':
            if (message.payload && typeof message.payload === 'object') {
              const payload = message.payload as Record<string, unknown>;
              const interpretation = (payload.interpretation !== null && typeof payload.interpretation === 'object')
                ? payload.interpretation as ConductorInterpreterResult['interpretation']
                : undefined;
              const diagnostics = (payload.diagnostics !== null && typeof payload.diagnostics === 'object')
                ? payload.diagnostics as ConductorInterpreterResult['diagnostics']
                : undefined;
              onConductorIntentRef.current?.({
                accepted: typeof payload.accepted === 'boolean' ? payload.accepted : false,
                confidence: typeof payload.confidence === 'number' ? payload.confidence : 0,
                reason:
                  typeof payload.reason === 'string'
                    ? payload.reason
                    : 'model_parse_failure',
                explicit_target:
                  isConductorAgentKey(payload.explicit_target)
                    ? payload.explicit_target
                    : null,
                ...(interpretation ? { interpretation } : {}),
                ...(typeof payload.rejected_reason === 'string' ? { rejected_reason: payload.rejected_reason } : {}),
                ...(diagnostics ? { diagnostics } : {}),
              });
            } else {
              onConductorIntentRef.current?.({
                accepted: false,
                confidence: 0,
                reason: 'model_parse_failure',
                explicit_target: null,
                rejected_reason: 'Malformed conductor_intent message from runtime.',
              });
            }
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
    if (!shouldReconnectRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!shouldReconnectRef.current) return;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      setIsConnected(true);
      setError(null);
      setStatus('connecting');
      reconnectAttemptsRef.current = 0; // Reset on successful connection
      ws.send(JSON.stringify({
        type: 'set_context_inspector',
        enabled: contextInspectorEnabledRef.current,
      }));
    };

    ws.onclose = () => {
      if (!shouldReconnectRef.current) return;
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
      if (!shouldReconnectRef.current) return;
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
      shouldReconnectRef.current = false;

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
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
      addLine('error', 'Not connected to runtime. Reconnecting...');
      connect();
    }
  }, [addLine, connect]);

  const sendStartJam = useCallback((activeAgents: string[]) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'start_jam', activeAgents }));
    }
  }, []);

  const sendBossDirective = useCallback((text: string, targetAgent?: string, activeAgents?: string[]) => {
    const trimmedText = text.trim();
    if (!trimmedText) {
      addLine('error', 'Cannot send an empty boss directive.');
      setError('Cannot send an empty boss directive.');
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'boss_directive', text: trimmedText, targetAgent, activeAgents,
      }));
      setStatus('thinking');
    }
  }, [addLine, setStatus]);

  const sendJamPreset = useCallback((presetId: string) => {
    if (!presetId) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'set_jam_preset', presetId }));
    }
  }, []);

  const sendStopJam = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stop_jam' }));
    }
  }, []);

  const sendCameraDirective = useCallback((
    payload: CameraDirectivePayload,
    activeAgents?: string[]
  ) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'camera_directive',
        visionPayload: payload,
        ...(activeAgents ? { activeAgents } : {}),
      }));
      setStatus('thinking');
      setError(null);
      return;
    }

    if (wsRef.current?.readyState === WebSocket.CONNECTING) {
      setError('Runtime is connecting; dropped camera directive.');
      return;
    }

    if (!shouldReconnectRef.current) {
      setError('Camera directives are blocked while runtime is disconnected.');
      return;
    }

    setError('Runtime disconnected; dropped camera directive.');
    connect();
  }, [connect]);

  const setContextInspectorEnabled = useCallback((enabled: boolean) => {
    contextInspectorEnabledRef.current = enabled;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'set_context_inspector', enabled }));
    }
  }, []);

  const sendAudioFeedback = useCallback((payload: AudioFeatureSnapshot) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'audio_feedback',
        payload,
      }));
    }
  }, []);

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
    sendStartJam,
    sendJamPreset,
    sendBossDirective,
    sendStopJam,
    sendCameraDirective,
    setContextInspectorEnabled,
    sendAudioFeedback,
    clearLines,
  };
}

// Provider-neutral primary alias.
export const useAiTerminal = useRuntimeTerminal;
// Backward-compatibility aliases while older imports migrate.
export const useCodexTerminal = useRuntimeTerminal;
