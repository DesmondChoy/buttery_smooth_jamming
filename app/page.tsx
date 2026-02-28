'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { TerminalDrawer } from '@/components/TerminalDrawer';
import { JamTopBar } from '@/components/JamTopBar';
import { AgentColumn } from '@/components/AgentColumn';
import { BossInputBar } from '@/components/BossInputBar';
import { PatternDisplay } from '@/components/PatternDisplay';
import { AgentSelectionModal } from '@/components/AgentSelectionModal';
import { AudioStartButton } from '@/components/AudioStartButton';
import {
  useAudioFeedback,
  useCameraConductor,
  useJamSession,
  useRuntimeTerminal,
  useStrudel,
  useWebSocket,
} from '@/hooks';
import { PRESETS } from '@/lib/musical-context-presets';
import {
  AGENT_META,
  type CameraDirectivePayload,
  type ConductorInterpreterResult,
  type ExecutePayload,
} from '@/lib/types';

const StrudelPanel = dynamic(
  () => import('@/components/StrudelPanel'),
  { ssr: false }
);

const SILENT_JAM_PATTERN = 'silence';

const AGENT_HINTS: Record<string, string> = {
  drums: 'Syncopation-obsessed, provides the rhythmic foundation',
  bass: 'Selfless minimalist who locks in with the kick drum',
  melody: 'Classically trained, insists on harmonic correctness',
  chords: 'Comping specialist, fills the harmonic middle',
};

export default function Home() {
  const [audioReady, setAudioReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedJamPresetId, setSelectedJamPresetId] = useState<string | null>(null);
  const [jamPlayRequested, setJamPlayRequested] = useState(false);
  const [lastSentJamPresetId, setLastSentJamPresetId] = useState<string | null>(null);
  const [isCameraConductorEnabled, setIsCameraConductorEnabled] = useState(false);
  const [lastConductorIntentSummary, setLastConductorIntentSummary] = useState<string | null>(null);
  const pendingExecuteFrameRef = useRef<number | null>(null);

  const { ref, setCode, evaluate, stop, onEditorReady } = useStrudel();

  // Handle tool calls from the runtime terminal
  const handleToolUse = useCallback((toolName: string, toolInput: Record<string, unknown>) => {
    console.log('[Page] Tool use:', toolName, toolInput);
  }, []);

  // Jam broadcast handler ref — will be set after jam hooks are initialized
  const jamBroadcastRef = useRef<((message: { type: string; payload: unknown }) => void) | null>(null);

  const handleJamBroadcast = useCallback((message: { type: string; payload: unknown }) => {
    jamBroadcastRef.current?.(message);
  }, []);

  const handleConductorIntent = useCallback((result: ConductorInterpreterResult) => {
    console.debug('[CameraConductor] conductor_intent', result);

    const confidencePct = Math.round(Math.max(0, Math.min(1, result.confidence)) * 100);
    if (result.accepted) {
      const directive = result.interpretation?.directive?.trim();
      setLastConductorIntentSummary(
        directive
          ? `Camera intent accepted (${confidencePct}%): ${directive}`
          : `Camera intent accepted (${confidencePct}%)`
      );
      return;
    }

    if (result.reason === 'activation_required') {
      setLastConductorIntentSummary(
        result.rejected_reason
          || 'Camera cue blocked: activate at least one agent with a boss @mention first.'
      );
      return;
    }

    const minThreshold = result.diagnostics?.min_confidence_threshold;
    const thresholdPct = (typeof minThreshold === 'number' && Number.isFinite(minThreshold))
      ? Math.round(Math.max(0, Math.min(1, minThreshold)) * 100)
      : null;
    const motionScore = result.diagnostics?.sample_motion_score;
    const faceMotion = result.diagnostics?.sample_face_motion;
    const sampleIsStale = result.diagnostics?.sample_is_stale === true;
    const reason = result.rejected_reason || result.reason || 'Rejected by policy';
    const confidenceLabel = (
      result.reason === 'below_confidence_threshold' && thresholdPct !== null
    )
      ? `${confidencePct}% < ${thresholdPct}%`
      : `${confidencePct}%`;
    const signalBits = [
      (typeof motionScore === 'number' && Number.isFinite(motionScore))
        ? `motion=${motionScore.toFixed(2)}`
        : null,
      (typeof faceMotion === 'number' && Number.isFinite(faceMotion))
        ? `face=${faceMotion.toFixed(2)}`
        : null,
      sampleIsStale ? 'stale' : null,
    ].filter((entry): entry is string => Boolean(entry));
    const signalSummary = signalBits.length > 0
      ? ` (${signalBits.join(', ')})`
      : '';

    setLastConductorIntentSummary(`Camera cue skipped (${confidenceLabel}): ${reason}${signalSummary}`);
  }, []);

  // Lift useRuntimeTerminal to page level so sendStartJam is accessible
  const runtimeTerminal = useRuntimeTerminal({
    onToolUse: handleToolUse,
    onJamBroadcast: handleJamBroadcast,
    onConductorIntent: handleConductorIntent,
  });

  const jam = useJamSession({
    sendStartJam: runtimeTerminal.sendStartJam,
    sendStopJam: runtimeTerminal.sendStopJam,
    isRuntimeConnected: runtimeTerminal.isConnected,
  });

  const {
    status: runtimeStatus,
    isConnected: isRuntimeConnected,
    error: runtimeTerminalError,
    lines: runtimeLines,
    sendJamPreset,
    sendBossDirective,
    sendCameraDirective,
    sendMessage,
    clearLines,
    sendAudioFeedback,
  } = runtimeTerminal;

  // Destructure stable callbacks to satisfy React Compiler + exhaustive-deps
  const {
    addChatMessage,
    addBossDirective,
    requestStartJam,
    confirmStartJam,
    cancelStartJam,
    chatMessages,
    selectedAgents,
    activatedAgents,
    mutedAgents,
    isJamming,
    isJamReady,
    stopJam,
    musicalContext,
    autoTickTiming,
    agentStates,
    agentPatternChangeGlows,
    agentContextWindows,
    handleExecute: handleJamExecute,
    showAgentSelection,
    handleAgentThought,
    handleAgentCommentary,
    handleAgentStatus,
    handleAutoTickTimingUpdate,
    handleMusicalContextUpdate,
    handleJamStateUpdate,
  } = jam;

  useAudioFeedback({
    enabled: isJamming && audioReady && isRuntimeConnected,
    isAudioRunning: isPlaying,
    onFeedback: sendAudioFeedback,
    analysisIntervalMs: 1_000,
  });

  // Per-agent message filtering: each agent sees their own optional commentary
  // plus boss directives (both broadcast and targeted)
  const agentMessages = useMemo(() => {
    const result: Record<string, typeof chatMessages> = {};
    for (const key of selectedAgents) {
      result[key] = chatMessages.filter((msg) => {
        if (msg.type === 'agent_commentary') {
          return msg.agent === key;
        }
        if (msg.type === 'boss_directive') {
          return !msg.targetAgent || msg.targetAgent === key;
        }
        if (msg.type === 'system') {
          return true;
        }
        return false;
      });
    }
    return result;
  }, [chatMessages, selectedAgents]);

  const selectedJamPreset = useMemo(
    () => PRESETS.find((preset) => preset.id === selectedJamPresetId) ?? null,
    [selectedJamPresetId]
  );

  const isSelectedJamPresetApplied = Boolean(
    selectedJamPreset
    && musicalContext.genre
    && musicalContext.genre === selectedJamPreset.genre
  );

  const isJamPlayArmed = jamPlayRequested && isSelectedJamPresetApplied;
  const isJamPresetLocked = activatedAgents.length > 0;

  const handleStrudelError = useCallback((err: Error | null) => {
    setError(err?.message || null);
  }, []);

  const handlePlayStateChange = useCallback((playing: boolean) => {
    setIsPlaying(playing);
  }, []);

  const normalizeExecutePayload = useCallback((payload: unknown): ExecutePayload | null => {
    if (typeof payload === 'string') {
      return { code: payload };
    }

    if (payload && typeof payload === 'object' && 'code' in payload) {
      const payloadAsRecord = payload as Record<string, unknown>;
      const maybeCode = payloadAsRecord.code;
      if (typeof maybeCode !== 'string') {
        return null;
      }

      const turnSource = payloadAsRecord.turnSource;
      const executePayload: ExecutePayload = {
        code: maybeCode,
      };

      if (typeof payloadAsRecord.sessionId === 'string') {
        executePayload.sessionId = payloadAsRecord.sessionId;
      }
      if (typeof payloadAsRecord.round === 'number') {
        executePayload.round = payloadAsRecord.round;
      }
      if (
        turnSource === 'jam-start'
        || turnSource === 'directive'
        || turnSource === 'auto-tick'
        || turnSource === 'staged-silent'
      ) {
        executePayload.turnSource = turnSource;
      }
      if (Array.isArray(payloadAsRecord.changedAgents)) {
        executePayload.changedAgents = payloadAsRecord.changedAgents
          .filter((agent) => typeof agent === 'string') as string[];
      }
      if (typeof payloadAsRecord.changed === 'boolean') {
        executePayload.changed = payloadAsRecord.changed;
      }
      if (typeof payloadAsRecord.issuedAtMs === 'number') {
        executePayload.issuedAtMs = payloadAsRecord.issuedAtMs;
      }

      return executePayload;
    }

    return null;
  }, []);

  const handleExecute = useCallback((payload: ExecutePayload) => {
    handleJamExecute(payload);

    const code = payload.code;
    setCode(code);
    setError(null);

    if (pendingExecuteFrameRef.current !== null) {
      cancelAnimationFrame(pendingExecuteFrameRef.current);
      pendingExecuteFrameRef.current = null;
    }

    pendingExecuteFrameRef.current = requestAnimationFrame(() => {
      evaluate(true);
      setIsPlaying(true);
      pendingExecuteFrameRef.current = null;
    });
  }, [evaluate, handleJamExecute, setCode]);

  const handleStop = useCallback(() => {
    if (pendingExecuteFrameRef.current !== null) {
      cancelAnimationFrame(pendingExecuteFrameRef.current);
      pendingExecuteFrameRef.current = null;
    }
    stop();
    setIsPlaying(false);
  }, [stop]);

  // Wire jam broadcast messages from ai-ws/runtime-ws to jam session handlers
  // AgentProcessManager sends these directly to the browser client (not via /api/ws)
  useEffect(() => {
    jamBroadcastRef.current = (message: { type: string; payload: unknown }) => {
      switch (message.type) {
        case 'agent_thought':
          handleAgentThought(message.payload as Parameters<typeof handleAgentThought>[0]);
          break;
        case 'agent_commentary':
          handleAgentCommentary(message.payload as Parameters<typeof handleAgentCommentary>[0]);
          break;
        case 'agent_status':
          handleAgentStatus(message.payload as Parameters<typeof handleAgentStatus>[0]);
          break;
        case 'execute':
          {
            const executePayload = normalizeExecutePayload(message.payload);
            if (executePayload) {
              handleExecute(executePayload);
            }
          }
          break;
        case 'jam_state_update':
          handleJamStateUpdate(message.payload as Parameters<typeof handleJamStateUpdate>[0]);
          break;
        case 'auto_tick_timing_update':
          handleAutoTickTimingUpdate(message.payload as Parameters<typeof handleAutoTickTimingUpdate>[0]);
          break;
        case 'directive_error':
          addChatMessage({
            type: 'system',
            text: (message.payload as { message: string }).message,
          });
          break;
      }
    };
  }, [
    handleAgentThought,
    handleAgentCommentary,
    handleAgentStatus,
    handleAutoTickTimingUpdate,
    handleJamStateUpdate,
    normalizeExecutePayload,
    handleExecute,
    addChatMessage,
  ]);

  // Handle incoming chat messages from MCP send_message broadcasts
  // Agent commentary/thought broadcasts flow through jam websocket events, not send_message
  const handleWsMessage = useCallback((msg: { id: string; text: string; timestamp: Date; sender: string }) => {
    if (!isJamming) return;
    addChatMessage({
      type: 'system',
      text: msg.text,
    });
  }, [isJamming, addChatMessage]);

  // Keep the WebSocket connection for MCP server to send execute/stop commands
  const { isConnected: isExecutionWsConnected, error: wsError } = useWebSocket({
    onExecute: handleExecute,
    onStop: handleStop,
    onMessage: handleWsMessage,
    onAgentThought: handleAgentThought,
    onAgentCommentary: handleAgentCommentary,
    onAgentStatus: handleAgentStatus,
    onMusicalContextUpdate: handleMusicalContextUpdate,
    onJamStateUpdate: handleJamStateUpdate,
  });

  useEffect(() => {
    return () => {
      if (pendingExecuteFrameRef.current !== null) {
        cancelAnimationFrame(pendingExecuteFrameRef.current);
        pendingExecuteFrameRef.current = null;
      }
    };
  }, []);

  const handleAudioReady = useCallback(() => {
    setAudioReady(true);
  }, []);

  const handleConfirmStartJam = useCallback((agents: string[]) => {
    // Guarantee silence when entering jam mode, even if a prior normal-mode pattern was playing.
    handleStop();
    setSelectedJamPresetId(null);
    setJamPlayRequested(false);
    setLastSentJamPresetId(null);
    confirmStartJam(agents);
  }, [handleStop, confirmStartJam]);

  const handleSelectJamPreset = useCallback((presetId: string | null) => {
    // We do not support clearing the preset after Play has started, because the
    // backend has no "unset preset" command and would drift from the UI.
    if (jamPlayRequested && !isJamPresetLocked && !presetId) {
      return;
    }

    setSelectedJamPresetId(presetId);

    if (
      jamPlayRequested
      && presetId
      && isJamming
      && isJamReady
      && isRuntimeConnected
      && !isJamPresetLocked
    ) {
      setLastSentJamPresetId(presetId);
      sendJamPreset(presetId);
    }
  }, [
    jamPlayRequested,
    isJamPresetLocked,
    isJamming,
    isJamReady,
    isRuntimeConnected,
    sendJamPreset,
  ]);

  const handleJamPlay = useCallback(() => {
    if (!isJamming || !isJamReady || !audioReady || !isRuntimeConnected) return;
    if (!selectedJamPresetId) return;

    if (!jamPlayRequested) {
      setJamPlayRequested(true);
      handleExecute({ code: SILENT_JAM_PATTERN });
    }

    // Allow retries and resends until the server confirms the preset in jam state.
    if (!isSelectedJamPresetApplied) {
      setLastSentJamPresetId(selectedJamPresetId);
      sendJamPreset(selectedJamPresetId);
    }

    // If transport stopped for any reason before we finished arming the jam, restart silence.
    if (jamPlayRequested && !isPlaying) {
      handleExecute({ code: SILENT_JAM_PATTERN });
    }
  }, [
    isJamming,
    isJamReady,
    audioReady,
    isRuntimeConnected,
    jamPlayRequested,
    isPlaying,
    selectedJamPresetId,
    isSelectedJamPresetApplied,
    sendJamPreset,
    handleExecute,
  ]);

  const handleStopJamAndAudio = useCallback(() => {
    handleStop();
    setSelectedJamPresetId(null);
    setJamPlayRequested(false);
    setLastSentJamPresetId(null);
    stopJam();
  }, [handleStop, stopJam]);

  const isJamPresetApplying = Boolean(
    jamPlayRequested
    && selectedJamPresetId
    && !isJamPlayArmed
    && lastSentJamPresetId === selectedJamPresetId
    && runtimeStatus === 'thinking'
  );

  const canPlayJam = Boolean(
    isJamming
    && isJamReady
    && isRuntimeConnected
    && audioReady
    && selectedJamPresetId
    && !isJamPresetLocked
    && (!isJamPlayArmed || !isPlaying)
  );

  const canSendJamDirectives = Boolean(
    isJamming
    && isJamReady
    && selectedJamPresetId
    && isJamPlayArmed
  );

  const canUseCameraConductor = Boolean(
    isJamming
    && isJamReady
    && isRuntimeConnected
    && canSendJamDirectives
  );

  const handleCameraVisionPayload = useCallback((payload: CameraDirectivePayload) => {
    sendCameraDirective(payload, selectedAgents);
  }, [sendCameraDirective, selectedAgents]);

  const {
    isReady: isCameraConductorReady,
    error: cameraConductorError,
  } = useCameraConductor({
    enabled: isCameraConductorEnabled && canUseCameraConductor,
    canSendDirectives: canSendJamDirectives,
    isJamming: canUseCameraConductor,
    onVisionPayload: handleCameraVisionPayload,
  });

  const cameraConductorIntentStatus = isCameraConductorEnabled && canUseCameraConductor && isJamming
    ? lastConductorIntentSummary
    : null;

  const handleSendDirective = useCallback((text: string, targetAgent?: string) => {
    if (!isJamming || !isJamReady || !selectedJamPresetId || !isJamPlayArmed) return;
    addBossDirective(text, targetAgent);
    sendBossDirective(text, targetAgent, selectedAgents);
  }, [
    isJamming,
    isJamReady,
    selectedJamPresetId,
    isJamPlayArmed,
    addBossDirective,
    sendBossDirective,
    selectedAgents,
  ]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input/textarea/contenteditable/code editor
      const target = e.target as HTMLElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable ||
        target.closest('.cm-editor')
      ) {
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'Enter') {
          if (isJamming) {
            e.preventDefault();
            handleJamPlay();
          }
        } else if (e.key === '.') {
          if (isJamming) {
            e.preventDefault();
            handleStopJamAndAudio();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isJamming, handleJamPlay, handleStopJamAndAudio]);

  const agentKeys = Object.keys(AGENT_META);

  return (
    <main className="flex flex-col h-screen overflow-hidden">
      {/* Top section: swaps based on jam mode */}
      <div className="flex flex-1 min-h-0 min-w-0">
        {isJamming ? (
          <div className="flex flex-col flex-1 min-h-0 min-w-0">
            {/* Top bar: controls + musical context */}
            <JamTopBar
              musicalContext={musicalContext}
              presets={PRESETS}
              selectedPresetId={selectedJamPresetId}
              isPresetLocked={isJamPresetLocked}
              showPresetPreview={!isJamPlayArmed}
              canPlayJam={canPlayJam}
              isPlaying={isPlaying}
              isAudioReady={audioReady}
              isJamReady={isJamReady}
              isPresetApplying={isJamPresetApplying}
              autoTickTiming={autoTickTiming}
              showAutoTickCountdown={isJamPlayArmed && activatedAgents.length > 0}
              errorMessage={runtimeTerminalError}
              onSelectPreset={handleSelectJamPreset}
              onPlayJam={handleJamPlay}
              onStopJam={handleStopJamAndAudio}
              isCameraConductorEnabled={isCameraConductorEnabled}
              isCameraConductorReady={isCameraConductorReady}
              canEnableCameraConductor={canUseCameraConductor}
              cameraConductorError={cameraConductorError}
              cameraConductorIntentStatus={cameraConductorIntentStatus}
              onToggleCameraConductor={setIsCameraConductorEnabled}
            />

            {/* Agent columns grid */}
            <div
              className="flex-1 min-h-0 grid gap-px bg-stage-border overflow-hidden"
              style={{ gridTemplateColumns: `repeat(${selectedAgents.length}, minmax(0, 1fr))` }}
            >
              {selectedAgents.map((key) => (
                <AgentColumn
                  key={key}
                  agentKey={key}
                  agentState={agentStates[key]}
                  isMuted={mutedAgents.includes(key)}
                  messages={agentMessages[key] ?? []}
                  isPatternChange={agentPatternChangeGlows[key]}
                  contextWindow={agentContextWindows[key]}
                  isContextInspectorEnabled
                />
              ))}
            </div>

            {/* Boss input bar */}
            <BossInputBar
              selectedAgents={selectedAgents}
              isConnected={isRuntimeConnected}
              isJamming={isJamming}
              canSendDirectives={canSendJamDirectives}
              onSendDirective={handleSendDirective}
            />

            {/* Pattern display */}
            <PatternDisplay
              agentStates={agentStates}
              selectedAgents={selectedAgents}
            />
          </div>
        ) : (
          <>
            {/* Terminal drawer (replaces inline terminal) */}
            <TerminalDrawer
              lines={runtimeLines}
              status={runtimeStatus}
              isConnected={isRuntimeConnected}
              sendMessage={sendMessage}
              clearLines={clearLines}
            />

            {/* Hero landing page */}
            <div className="flex-1 flex flex-col items-center justify-center p-8 relative overflow-y-auto">
              {/* Undulating sound waves background */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
                <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 1440 800">
                  {/* Wave cluster — top 30% of the screen */}
                  <g style={{ animation: 'wave-drift-1 8s ease-in-out infinite' }}>
                    <path
                      d="M-200,100 C40,40 280,160 520,100 C760,40 1000,160 1240,100 C1480,40 1640,120 1640,100"
                      fill="none"
                      stroke="rgba(245,158,11,0.18)"
                      strokeWidth="2.5"
                    />
                  </g>
                  <g style={{ animation: 'wave-drift-2 10s ease-in-out infinite' }}>
                    <path
                      d="M-200,140 C100,80 340,200 600,140 C860,80 1100,200 1400,140 C1540,100 1640,160 1640,140"
                      fill="none"
                      stroke="rgba(245,158,11,0.13)"
                      strokeWidth="2"
                    />
                  </g>
                  <g style={{ animation: 'wave-drift-3 12s ease-in-out infinite' }}>
                    <path
                      d="M-200,180 C-20,120 160,240 340,180 C520,120 700,240 880,180 C1060,120 1240,240 1420,180 C1600,120 1640,200 1640,180"
                      fill="none"
                      stroke="rgba(217,119,6,0.12)"
                      strokeWidth="1.5"
                    />
                  </g>
                  <g style={{ animation: 'wave-drift-2 11s ease-in-out infinite', animationDelay: '-4s' }}>
                    <path
                      d="M-200,210 C80,150 320,270 600,210 C880,150 1120,270 1440,210 C1540,190 1640,230 1640,210"
                      fill="none"
                      stroke="rgba(196,184,168,0.10)"
                      strokeWidth="1.5"
                    />
                  </g>
                </svg>
              </div>
              <h1 className="text-5xl md:text-6xl font-display font-bold mb-4 bg-gradient-to-r from-amber-500 to-amber-300 bg-clip-text text-transparent">
                Buttery Smooth Jamming
              </h1>
              <p className="text-stage-text text-lg mb-10 text-center max-w-xl">
                AI-powered live coding music. Four AI band members. One stage. You&apos;re the boss.
              </p>

              {/* Error banner */}
              {(wsError || error || !isExecutionWsConnected) && (
                <div className="w-full max-w-4xl mb-6 bg-red-900/30 border border-red-500/50 rounded-xl p-3">
                  <p className="text-red-200 text-sm font-mono">
                    {wsError
                      || error
                      || 'Execution WebSocket disconnected. Playback updates may not reach Strudel until it reconnects.'}
                  </p>
                </div>
              )}

              {/* Start Jam CTA */}
              <button
                onClick={requestStartJam}
                className="px-10 py-5 rounded-2xl font-display font-bold text-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stage-black transition-all duration-200 hover:scale-105 animate-glow-pulse mb-10"
              >
                Start a Jam Session
              </button>

            {/* Stage plot — the band lineup */}
            <div className="w-full max-w-3xl mb-10">
                {/* Stage floor */}
                <div className="relative rounded-xl bg-gradient-to-b from-stage-dark to-stage-black border border-stage-border/60 overflow-hidden px-4 py-8 md:py-10">
                  {/* Subtle stage edge highlight */}
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-500/30 to-transparent" />

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-4">
                    {agentKeys.map((key, i) => {
                      const meta = AGENT_META[key];
                      return (
                        <div
                          key={key}
                          className="flex flex-col items-center gap-3 animate-fade-in-up"
                          style={{ animationDelay: `${i * 100}ms` }}
                        >
                          {/* Spotlight cone — overhead light pool */}
                          <div className="relative flex items-center justify-center w-36 h-36">
                            {/* Outer glow */}
                            <div
                              className="absolute inset-0 rounded-full animate-spotlight-breathe"
                              style={{
                                background: `radial-gradient(circle, currentColor 0%, transparent 70%)`,
                                animationDelay: `${i * 1.1}s`,
                                opacity: 0.12,
                              }}
                            />
                            {/* Inner glow */}
                            <div
                              className="absolute inset-5 rounded-full"
                              style={{
                                background: `radial-gradient(circle, currentColor 0%, transparent 70%)`,
                                opacity: 0.08,
                              }}
                            />
                            {/* Emoji — the instrument on stage */}
                            <span className="relative text-7xl select-none">{meta.emoji}</span>
                          </div>

                          {/* Gaffer-tape nameplate */}
                          <div className="flex flex-col items-center gap-1">
                            <span className={`font-mono text-sm font-bold tracking-[0.2em] uppercase ${meta.colors.accent}`}>
                              {meta.name}
                            </span>
                            <span className="text-stage-muted text-sm text-center leading-snug max-w-[180px]">
                              {AGENT_HINTS[key]}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Stage front edge — a subtle "lip" */}
                  <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-stage-border to-transparent" />
                </div>
              </div>


            </div>
          </>
        )}
      </div>

      {/* StrudelPanel always rendered but hidden (prevents audio interruption on mode switch) */}
      <div className="h-0 overflow-hidden">
        <StrudelPanel
          ref={ref}
          initialCode={`// Welcome to Buttery Smooth Jamming!
// Press play or Ctrl+Enter to start
note("c3 e3 g3 c4").sound("piano")._pianoroll({ fold: 1 })`}
          className="rounded-none overflow-hidden"
          onError={handleStrudelError}
          onPlayStateChange={handlePlayStateChange}
          onReady={onEditorReady}
        />
      </div>

      {/* Agent selection modal */}
      {showAgentSelection && (
        <AgentSelectionModal
          onConfirm={handleConfirmStartJam}
          onCancel={cancelStartJam}
          initialSelection={selectedAgents}
        />
      )}

      {!audioReady && <AudioStartButton onAudioReady={handleAudioReady} />}
    </main>
  );
}
