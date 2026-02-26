'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { TerminalPanel } from '@/components/TerminalPanel';
import { JamControls } from '@/components/JamControls';
import { JamTopBar } from '@/components/JamTopBar';
import { AgentColumn } from '@/components/AgentColumn';
import { BossInputBar } from '@/components/BossInputBar';
import { PatternDisplay } from '@/components/PatternDisplay';
import { AgentSelectionModal } from '@/components/AgentSelectionModal';
import { AudioStartButton } from '@/components/AudioStartButton';
import { useWebSocket, useStrudel, useRuntimeTerminal, useJamSession } from '@/hooks';
import { PRESETS } from '@/lib/musical-context-presets';

const StrudelPanel = dynamic(
  () => import('@/components/StrudelPanel'),
  { ssr: false }
);

const SILENT_JAM_PATTERN = 'silence';

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
    isJamming,
    isJamReady,
    stopJam,
    musicalContext,
    agentStates,
    showAgentSelection,
    handleAgentThought,
    handleAgentStatus,
    handleMusicalContextUpdate,
    handleJamStateUpdate,
  } = jam;

  // Per-agent message filtering: each agent sees their own thoughts/reactions
  // plus boss directives (both broadcast and targeted)
  const agentMessages = useMemo(() => {
    const result: Record<string, typeof chatMessages> = {};
    for (const key of selectedAgents) {
      result[key] = chatMessages.filter((msg) => {
        if (msg.type === 'agent_thought' || msg.type === 'agent_reaction') {
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
  }, [handleAgentThought, handleAgentStatus, handleJamStateUpdate, handleExecute, addChatMessage]);

  // Handle incoming chat messages from MCP send_message broadcasts
  // Agent reactions flow through update_agent_state → agent_thought, not send_message
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
              className="flex-1 min-h-0 grid gap-px bg-gray-700 overflow-hidden"
              style={{ gridTemplateColumns: `repeat(${selectedAgents.length}, minmax(0, 1fr))` }}
            >
              {selectedAgents.map((key) => (
                <AgentColumn
                  key={key}
                  agentKey={key}
                  agentState={agentStates[key]}
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
            {/* Normal mode: terminal on left */}
            <TerminalPanel
              lines={runtimeLines}
              status={runtimeStatus}
              isConnected={isRuntimeConnected}
              sendMessage={sendMessage}
              clearLines={clearLines}
              className="w-1/3 min-w-[300px] border-r border-gray-700"
            />

            {/* Normal mode: content on right */}
            <div className="flex-1 flex flex-col items-center p-8 relative overflow-y-auto">
              <h1 className="text-4xl font-bold mb-4">Buttery Smooth Jamming</h1>
              <p className="text-gray-400 text-lg mb-8">
                AI-assisted live coding music with Strudel
              </p>

              {/* Error banner */}
              {(wsError || error || !isExecutionWsConnected) && (
                <div className="w-full max-w-4xl mb-4 bg-red-900/50 border border-red-500 rounded-lg p-3">
                  <p className="text-red-200 text-sm font-mono">
                    {wsError
                      || error
                      || 'Execution WebSocket disconnected. Playback updates may not reach Strudel until it reconnects.'}
                  </p>
                </div>
              )}

              {/* Play/Stop controls */}
              <div className="w-full max-w-4xl mb-4 flex gap-2">
                <button
                  onClick={handlePlay}
                  disabled={!audioReady}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    isPlaying
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-700 hover:bg-gray-600 text-white'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {isPlaying ? '▶ Playing' : '▶ Play'}
                </button>
                <button
                  onClick={handleStop}
                  disabled={!audioReady || !isPlaying}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ◼ Stop
                </button>
                <span className="flex items-center text-gray-500 text-sm ml-4">
                  Ctrl+Enter to play • Ctrl+. to stop
                </span>
              </div>

              {/* Jam session controls */}
              <JamControls
                isJamming={isJamming}
                isRuntimeConnected={isRuntimeConnected}
                onStartJam={requestStartJam}
                onStopJam={stopJam}
                className="w-full max-w-4xl mb-4"
              />
            </div>
          </>
        )}
      </div>

      {/* Bottom: StrudelPanel always rendered (prevents audio interruption on mode switch) */}
      <div className={`border-t border-gray-700 shrink-0 ${isJamming ? 'h-0 overflow-hidden' : ''}`}>
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
