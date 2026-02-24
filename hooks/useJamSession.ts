'use client';

import { useState, useCallback, useRef } from 'react';
import type {
  AgentState,
  MusicalContext,
  JamChatMessage,
  AgentThoughtPayload,
  AgentStatusPayload,
  MusicalContextPayload,
  JamStatePayload,
} from '@/lib/types';
import { AGENT_META } from '@/lib/types';

const MAX_CHAT_MESSAGES = 500;

const ALL_AGENT_KEYS = Object.keys(AGENT_META);

interface UseJamSessionOptions {
  sendStartJam: (activeAgents: string[]) => void;
  sendStopJam: () => void;
  isRuntimeConnected?: boolean;
  isAiConnected?: boolean;
}

export interface UseJamSessionReturn {
  // State
  isJamming: boolean;
  agentStates: Record<string, AgentState>;
  musicalContext: MusicalContext;
  chatMessages: JamChatMessage[];
  selectedAgents: string[];
  showAgentSelection: boolean;

  // Actions
  startJam: () => void;
  stopJam: () => void;
  addBossDirective: (text: string, targetAgent?: string) => void;
  addChatMessage: (msg: Omit<JamChatMessage, 'id' | 'timestamp'>) => void;
  clearChatMessages: () => void;
  requestStartJam: () => void;
  confirmStartJam: (agents: string[]) => void;
  cancelStartJam: () => void;

  // Callbacks (wire into useWebSocket in page.tsx)
  handleAgentThought: (payload: AgentThoughtPayload) => void;
  handleAgentStatus: (payload: AgentStatusPayload) => void;
  handleMusicalContextUpdate: (payload: MusicalContextPayload) => void;
  handleJamStateUpdate: (payload: JamStatePayload) => void;
}

const DEFAULT_AGENTS: Record<string, AgentState> = Object.fromEntries(
  Object.entries(AGENT_META).map(([key, meta]) => [
    key,
    { name: meta.name, emoji: meta.emoji, pattern: '', fallbackPattern: '', thoughts: '', reaction: '', status: 'idle' as const, lastUpdated: '' },
  ])
);

const DEFAULT_MUSICAL_CONTEXT: MusicalContext = {
  key: 'C',
  scale: ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
  chordProgression: ['Cmaj7', 'Am7', 'Fmaj7', 'G7'],
  bpm: 120,
  timeSignature: '4/4',
  energy: 5,
};

export function useJamSession(options: UseJamSessionOptions): UseJamSessionReturn {
  const { sendStartJam, sendStopJam } = options;
  const isRuntimeConnected =
    options.isRuntimeConnected
    ?? options.isAiConnected
    ?? false;

  const [isJamming, setIsJamming] = useState(false);
  const [agentStates, setAgentStates] = useState<Record<string, AgentState>>({ ...DEFAULT_AGENTS });
  const [musicalContext, setMusicalContext] = useState<MusicalContext>(DEFAULT_MUSICAL_CONTEXT);
  const [chatMessages, setChatMessages] = useState<JamChatMessage[]>([]);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([...ALL_AGENT_KEYS]);
  const [showAgentSelection, setShowAgentSelection] = useState(false);

  const selectedAgentsRef = useRef(selectedAgents);

  const addChatMessage = useCallback((msg: Omit<JamChatMessage, 'id' | 'timestamp'>) => {
    setChatMessages((prev) => {
      const next = [...prev, { ...msg, id: crypto.randomUUID(), timestamp: new Date() }];
      return next.length > MAX_CHAT_MESSAGES ? next.slice(-MAX_CHAT_MESSAGES) : next;
    });
  }, []);

  const addBossDirective = useCallback((text: string, targetAgent?: string) => {
    addChatMessage({
      type: 'boss_directive',
      text,
      targetAgent,
    });
  }, [addChatMessage]);

  const clearChatMessages = useCallback(() => {
    setChatMessages([]);
  }, []);

  const startJam = useCallback(() => {
    if (!isRuntimeConnected) return;
    setIsJamming(true);
    sendStartJam(selectedAgentsRef.current);
  }, [isRuntimeConnected, sendStartJam]);

  const stopJam = useCallback(() => {
    setIsJamming(false);
    clearChatMessages();
    setAgentStates(prev => {
      const reset = { ...prev };
      for (const key of Object.keys(reset)) {
        reset[key] = { ...reset[key], status: 'idle' };
      }
      return reset;
    });
    // Tell server to kill agent processes
    sendStopJam();
  }, [clearChatMessages, sendStopJam]);

  const requestStartJam = useCallback(() => {
    if (!isRuntimeConnected) return;
    setShowAgentSelection(true);
  }, [isRuntimeConnected]);

  const confirmStartJam = useCallback((agents: string[]) => {
    setSelectedAgents(agents);
    selectedAgentsRef.current = agents;
    setShowAgentSelection(false);

    // Start the jam
    setIsJamming(true);
    sendStartJam(agents);
  }, [sendStartJam]);

  const cancelStartJam = useCallback(() => {
    setShowAgentSelection(false);
  }, []);

  // --- Callbacks for useWebSocket ---

  const handleAgentThought = useCallback((payload: AgentThoughtPayload) => {
    // Update agent state
    setAgentStates((prev) => {
      const agent = prev[payload.agent];
      if (!agent) return prev;
      return {
        ...prev,
        [payload.agent]: {
          ...agent,
          thoughts: payload.thought,
          reaction: payload.reaction,
          pattern: payload.pattern,
          status: 'idle' as const,
          lastUpdated: payload.timestamp,
        },
      };
    });

    // Push chat messages separately (not inside state updater to keep it pure)
    const agentInfo = AGENT_META[payload.agent];
    if (!agentInfo) return;

    addChatMessage({
      type: 'agent_thought',
      agent: payload.agent,
      agentName: agentInfo.name,
      emoji: agentInfo.emoji,
      text: payload.thought,
      pattern: payload.pattern || undefined,
    });

    // Push reaction as separate message if non-empty and different from thought
    if (payload.reaction && payload.reaction !== payload.thought) {
      addChatMessage({
        type: 'agent_reaction',
        agent: payload.agent,
        agentName: agentInfo.name,
        emoji: agentInfo.emoji,
        text: payload.reaction,
      });
    }
  }, [addChatMessage]);

  const handleAgentStatus = useCallback((payload: AgentStatusPayload) => {
    setAgentStates((prev) => {
      const agent = prev[payload.agent];
      if (!agent) return prev;
      return {
        ...prev,
        [payload.agent]: {
          ...agent,
          status: payload.status,
        },
      };
    });
  }, []);

  const handleMusicalContextUpdate = useCallback((payload: MusicalContextPayload) => {
    setMusicalContext(payload.musicalContext);
  }, []);

  const handleJamStateUpdate = useCallback((payload: JamStatePayload) => {
    // Full state sync from the server
    const { jamState } = payload;
    setAgentStates(jamState.agents);
    setMusicalContext(jamState.musicalContext);
  }, []);

  return {
    isJamming,
    agentStates,
    musicalContext,
    chatMessages,
    selectedAgents,
    showAgentSelection,

    startJam,
    stopJam,
    addBossDirective,
    addChatMessage,
    clearChatMessages,
    requestStartJam,
    confirmStartJam,
    cancelStartJam,

    handleAgentThought,
    handleAgentStatus,
    handleMusicalContextUpdate,
    handleJamStateUpdate,
  };
}
