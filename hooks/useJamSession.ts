'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  AgentState,
  MusicalContext,
  JamChatMessage,
  AgentThoughtPayload,
  AgentStatusPayload,
  MusicalContextPayload,
  JamStatePayload,
} from '@/lib/types';

const DEFAULT_ROUND_DURATION = 16000; // 8 bars @ 120 BPM
const MIN_ROUND_DURATION = 8000;
const MAX_ROUND_DURATION = 30000;
const PROGRESS_INTERVAL = 100; // ms between progress bar updates
const MAX_CHAT_MESSAGES = 500;

interface UseJamSessionOptions {
  sendJamTick: (round: number) => void;
  isClaudeConnected: boolean;
  roundDuration?: number;
}

export interface UseJamSessionReturn {
  // State
  isJamming: boolean;
  currentRound: number;
  agentStates: Record<string, AgentState>;
  musicalContext: MusicalContext;
  roundProgress: number;
  roundDuration: number;
  chatMessages: JamChatMessage[];

  // Actions
  startJam: () => void;
  stopJam: () => void;
  setRoundDuration: (ms: number) => void;
  addBossDirective: (text: string) => void;
  addChatMessage: (msg: Omit<JamChatMessage, 'id' | 'timestamp'>) => void;
  clearChatMessages: () => void;

  // Callbacks (wire into useWebSocket in page.tsx)
  handleAgentThought: (payload: AgentThoughtPayload) => void;
  handleAgentStatus: (payload: AgentStatusPayload) => void;
  handleMusicalContextUpdate: (payload: MusicalContextPayload) => void;
  handleJamStateUpdate: (payload: JamStatePayload) => void;
}

const DEFAULT_AGENTS: Record<string, AgentState> = {
  drums:  { name: 'BEAT',   emoji: '🥁',  pattern: '', fallbackPattern: '', thoughts: '', reaction: '', status: 'idle', lastUpdated: '' },
  bass:   { name: 'GROOVE', emoji: '🎸',  pattern: '', fallbackPattern: '', thoughts: '', reaction: '', status: 'idle', lastUpdated: '' },
  melody: { name: 'ARIA',   emoji: '🎹',  pattern: '', fallbackPattern: '', thoughts: '', reaction: '', status: 'idle', lastUpdated: '' },
  fx:     { name: 'GLITCH', emoji: '🎛️', pattern: '', fallbackPattern: '', thoughts: '', reaction: '', status: 'idle', lastUpdated: '' },
};

const DEFAULT_MUSICAL_CONTEXT: MusicalContext = {
  key: 'C',
  scale: ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
  chordProgression: ['Cmaj7', 'Am7', 'Fmaj7', 'G7'],
  bpm: 120,
  timeSignature: '4/4',
  energy: 5,
};

export function useJamSession(options: UseJamSessionOptions): UseJamSessionReturn {
  const { sendJamTick, isClaudeConnected, roundDuration: initialDuration = DEFAULT_ROUND_DURATION } = options;

  const [isJamming, setIsJamming] = useState(false);
  const [currentRound, setCurrentRound] = useState(0);
  const [agentStates, setAgentStates] = useState<Record<string, AgentState>>({ ...DEFAULT_AGENTS });
  const [musicalContext, setMusicalContext] = useState<MusicalContext>(DEFAULT_MUSICAL_CONTEXT);
  const [roundProgress, setRoundProgress] = useState(0);
  const [roundDuration, setRoundDurationState] = useState(initialDuration);
  const [chatMessages, setChatMessages] = useState<JamChatMessage[]>([]);

  // Refs for interval management
  const tickIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const processingRef = useRef(false);
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const roundStartTimeRef = useRef(0);
  const roundRef = useRef(0);
  const roundDurationRef = useRef(roundDuration);
  const sendJamTickRef = useRef(sendJamTick);

  const addChatMessage = useCallback((msg: Omit<JamChatMessage, 'id' | 'timestamp'>) => {
    setChatMessages((prev) => {
      const next = [...prev, { ...msg, id: crypto.randomUUID(), timestamp: new Date() }];
      return next.length > MAX_CHAT_MESSAGES ? next.slice(-MAX_CHAT_MESSAGES) : next;
    });
  }, []);

  const addBossDirective = useCallback((text: string) => {
    addChatMessage({
      type: 'boss_directive',
      text,
      round: roundRef.current,
    });
  }, [addChatMessage]);

  const clearChatMessages = useCallback(() => {
    setChatMessages([]);
  }, []);

  // Keep refs in sync
  useEffect(() => {
    roundDurationRef.current = roundDuration;
  }, [roundDuration]);

  useEffect(() => {
    sendJamTickRef.current = sendJamTick;
  }, [sendJamTick]);

  const clearAllIntervals = useCallback(() => {
    if (tickIntervalRef.current) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
      processingTimeoutRef.current = null;
    }
  }, []);

  const sendTick = useCallback(() => {
    // Skip if orchestrator is still processing the previous tick
    if (processingRef.current) return;

    roundRef.current += 1;
    const round = roundRef.current;
    setCurrentRound(round);
    processingRef.current = true;
    roundStartTimeRef.current = Date.now();
    setRoundProgress(0);

    sendJamTickRef.current(round);

    // Safety valve: reset processing flag if stuck for 2x round duration
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
    }
    processingTimeoutRef.current = setTimeout(() => {
      processingRef.current = false;
    }, roundDurationRef.current * 2);
  }, []);

  const startProgressInterval = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }
    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - roundStartTimeRef.current;
      const progress = Math.min(elapsed / roundDurationRef.current, 1);
      setRoundProgress(progress);
    }, PROGRESS_INTERVAL);
  }, []);

  const startTickInterval = useCallback(() => {
    if (tickIntervalRef.current) {
      clearInterval(tickIntervalRef.current);
    }
    tickIntervalRef.current = setInterval(() => {
      sendTick();
    }, roundDurationRef.current);
  }, [sendTick]);

  const startJam = useCallback(() => {
    if (!isClaudeConnected) return;

    setIsJamming(true);
    roundRef.current = 0;
    processingRef.current = false;
    roundStartTimeRef.current = Date.now();

    // Fire first tick immediately
    sendTick();

    // Start interval for subsequent ticks
    startTickInterval();

    // Start progress bar updates
    startProgressInterval();
  }, [isClaudeConnected, sendTick, startTickInterval, startProgressInterval]);

  const stopJam = useCallback(() => {
    setIsJamming(false);
    clearAllIntervals();
    processingRef.current = false;
    setRoundProgress(0);
    clearChatMessages();
  }, [clearAllIntervals, clearChatMessages]);

  const setRoundDuration = useCallback((ms: number) => {
    const clamped = Math.max(MIN_ROUND_DURATION, Math.min(MAX_ROUND_DURATION, ms));
    setRoundDurationState(clamped);
  }, []);

  // Restart interval when roundDuration changes mid-jam
  useEffect(() => {
    if (isJamming) {
      startTickInterval();
      startProgressInterval();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundDuration]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearAllIntervals();
    };
  }, [clearAllIntervals]);

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
    // Read agent info from DEFAULT_AGENTS since it's static
    const agentInfo = DEFAULT_AGENTS[payload.agent];
    if (!agentInfo) return;

    addChatMessage({
      type: 'agent_thought',
      agent: payload.agent,
      agentName: agentInfo.name,
      emoji: agentInfo.emoji,
      text: payload.thought,
      pattern: payload.pattern || undefined,
      compliedWithBoss: payload.compliedWithBoss,
      round: roundRef.current,
    });

    // Push reaction as separate message if non-empty and different from thought
    if (payload.reaction && payload.reaction !== payload.thought) {
      addChatMessage({
        type: 'agent_reaction',
        agent: payload.agent,
        agentName: agentInfo.name,
        emoji: agentInfo.emoji,
        text: payload.reaction,
        round: roundRef.current,
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
    // Full state sync from the server — end of round
    const { jamState } = payload;
    setCurrentRound(jamState.currentRound);
    setAgentStates(jamState.agents);
    setMusicalContext(jamState.musicalContext);

    // Reset processing flag — orchestrator is done with this round
    processingRef.current = false;
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
      processingTimeoutRef.current = null;
    }

    // Reset progress for next round
    roundStartTimeRef.current = Date.now();
    setRoundProgress(0);
  }, []);

  return {
    isJamming,
    currentRound,
    agentStates,
    musicalContext,
    roundProgress,
    roundDuration,
    chatMessages,

    startJam,
    stopJam,
    setRoundDuration,
    addBossDirective,
    addChatMessage,
    clearChatMessages,

    handleAgentThought,
    handleAgentStatus,
    handleMusicalContextUpdate,
    handleJamStateUpdate,
  };
}
