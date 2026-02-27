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
import { useWebSocket, useStrudel, useRuntimeTerminal, useJamSession } from '@/hooks';
import { PRESETS } from '@/lib/musical-context-presets';
import { AGENT_META } from '@/lib/types';

const StrudelPanel = dynamic(
  () => import('@/components/StrudelPanel'),
  { ssr: false }
);

const SILENT_JAM_PATTERN = 'silence';

const AGENT_HINTS: Record<string, string> = {
  drums: 'Syncopation-obsessed veteran with high ego',
  bass: 'Selfless minimalist who locks with the kick',
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

  // Lift useRuntimeTerminal to page level so sendStartJam is accessible
  const runtimeTerminal = useRuntimeTerminal({ onToolUse: handleToolUse, onJamBroadcast: handleJamBroadcast });

  const jam = useJamSession({
    sendStartJam: runtimeTerminal.sendStartJam,
    sendStopJam: runtimeTerminal.sendStopJam,
    isRuntimeConnected: runtimeTerminal.isConnected,
  });

  const {
    lines: runtimeLines,
    status: runtimeStatus,
    isConnected: isRuntimeConnected,
    error: runtimeTerminalError,
    sendMessage,
    clearLines,
    sendJamPreset,
    sendBossDirective,
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
    agentStates,
    showAgentSelection,
    handleAgentThought,
    handleAgentCommentary,
    handleAgentStatus,
    handleMusicalContextUpdate,
    handleJamStateUpdate,
  } = jam;

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

  const handleExecute = useCallback((code: string) => {
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
  }, [setCode, evaluate]);

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
          handleExecute((message.payload as { code: string }).code);
          break;
        case 'jam_state_update':
          handleJamStateUpdate(message.payload as Parameters<typeof handleJamStateUpdate>[0]);
          break;
        case 'directive_error':
          addChatMessage({
            type: 'system',
            text: (message.payload as { message: string }).message,
          });
          break;
      }
    };
  }, [handleAgentThought, handleAgentCommentary, handleAgentStatus, handleJamStateUpdate, handleExecute, addChatMessage]);

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

  const handlePlay = useCallback(() => {
    evaluate(true);
    setIsPlaying(true);
  }, [evaluate]);

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
      handleExecute(SILENT_JAM_PATTERN);
    }

    // Allow retries and resends until the server confirms the preset in jam state.
    if (!isSelectedJamPresetApplied) {
      setLastSentJamPresetId(selectedJamPresetId);
      sendJamPreset(selectedJamPresetId);
    }

    // If transport stopped for any reason before we finished arming the jam, restart silence.
    if (jamPlayRequested && !isPlaying) {
      handleExecute(SILENT_JAM_PATTERN);
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
          e.preventDefault();
          if (isJamming) {
            handleJamPlay();
          } else if (audioReady) {
            handlePlay();
          }
        } else if (e.key === '.') {
          e.preventDefault();
          if (isJamming) {
            handleStopJamAndAudio();
          } else if (audioReady && isPlaying) {
            handleStop();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [audioReady, isPlaying, isJamming, handlePlay, handleStop, handleJamPlay, handleStopJamAndAudio]);

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
              errorMessage={runtimeTerminalError}
              onSelectPreset={handleSelectJamPreset}
              onPlayJam={handleJamPlay}
              onStopJam={handleStopJamAndAudio}
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
                disabled={!isRuntimeConnected}
                className="px-10 py-5 rounded-2xl font-display font-bold text-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stage-black transition-all duration-200 hover:scale-105 animate-glow-pulse disabled:opacity-50 disabled:cursor-not-allowed disabled:animate-none mb-10"
              >
                Start a Jam Session
              </button>

              {/* Band member cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-3xl mb-10">
                {agentKeys.map((key, i) => {
                  const meta = AGENT_META[key];
                  return (
                    <div
                      key={key}
                      className="bg-stage-dark border border-stage-border rounded-xl p-4 text-center hover:scale-[1.03] transition-transform duration-200 animate-fade-in-up"
                      style={{ animationDelay: `${i * 100}ms` }}
                    >
                      <span className="text-3xl block mb-2">{meta.emoji}</span>
                      <span className={`font-display font-bold text-sm ${meta.colors.accent}`}>{meta.name}</span>
                      <p className="text-xs text-stage-text mt-1">{AGENT_HINTS[key]}</p>
                    </div>
                  );
                })}
              </div>

              {/* Keyboard shortcut hint */}
              <span className="text-stage-muted text-sm">
                Ctrl+Enter to play · Ctrl+. to stop
              </span>
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
