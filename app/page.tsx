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
import { useWebSocket, useStrudel, useClaudeTerminal, useJamSession } from '@/hooks';

const StrudelPanel = dynamic(
  () => import('@/components/StrudelPanel'),
  { ssr: false }
);

export default function Home() {
  const [audioReady, setAudioReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { ref, setCode, evaluate, stop, onEditorReady } = useStrudel();

  // Handle tool calls from Claude terminal
  const handleToolUse = useCallback((toolName: string, toolInput: Record<string, unknown>) => {
    console.log('[Page] Tool use:', toolName, toolInput);
  }, []);

  // Jam broadcast handler ref — will be set after jam hooks are initialized
  const jamBroadcastRef = useRef<((message: { type: string; payload: unknown }) => void) | null>(null);

  const handleJamBroadcast = useCallback((message: { type: string; payload: unknown }) => {
    jamBroadcastRef.current?.(message);
  }, []);

  // Lift useClaudeTerminal to page level so sendStartJam is accessible
  const claude = useClaudeTerminal({ onToolUse: handleToolUse, onJamBroadcast: handleJamBroadcast });

  const jam = useJamSession({
    sendStartJam: claude.sendStartJam,
    sendStopJam: claude.sendStopJam,
    isClaudeConnected: claude.isConnected,
  });

  // Destructure stable callbacks to satisfy React Compiler + exhaustive-deps
  const { addChatMessage, addBossDirective, requestStartJam, confirmStartJam, cancelStartJam, chatMessages, selectedAgents } = jam;

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

  const handleStrudelError = useCallback((err: Error | null) => {
    setError(err?.message || null);
  }, []);

  const handlePlayStateChange = useCallback((playing: boolean) => {
    setIsPlaying(playing);
  }, []);

  const handleExecute = useCallback((code: string) => {
    setCode(code);
    evaluate(true);
    setIsPlaying(true);
  }, [setCode, evaluate]);

  const handleStop = useCallback(() => {
    stop();
    setIsPlaying(false);
  }, [stop]);

  // Wire jam broadcast messages from claude-ws to jam session handlers
  // AgentProcessManager sends these directly to the browser client (not via /api/ws)
  useEffect(() => {
    jamBroadcastRef.current = (message: { type: string; payload: unknown }) => {
      switch (message.type) {
        case 'agent_thought':
          jam.handleAgentThought(message.payload as Parameters<typeof jam.handleAgentThought>[0]);
          break;
        case 'agent_status':
          jam.handleAgentStatus(message.payload as Parameters<typeof jam.handleAgentStatus>[0]);
          break;
        case 'execute':
          handleExecute((message.payload as { code: string }).code);
          break;
        case 'jam_state_update':
          jam.handleJamStateUpdate(message.payload as Parameters<typeof jam.handleJamStateUpdate>[0]);
          break;
        case 'directive_error':
          addChatMessage({
            type: 'system',
            text: (message.payload as { message: string }).message,
          });
          break;
      }
    };
  }, [jam.handleAgentThought, jam.handleAgentStatus, jam.handleJamStateUpdate, handleExecute, addChatMessage]);

  // Handle incoming chat messages from MCP send_message broadcasts
  // Agent reactions flow through update_agent_state → agent_thought, not send_message
  const handleWsMessage = useCallback((msg: { id: string; text: string; timestamp: Date; sender: string }) => {
    if (!jam.isJamming) return;
    addChatMessage({
      type: 'system',
      text: msg.text,
    });
  }, [jam.isJamming, addChatMessage]);

  // Keep the WebSocket connection for MCP server to send execute/stop commands
  const { error: wsError } = useWebSocket({
    onExecute: handleExecute,
    onStop: handleStop,
    onMessage: handleWsMessage,
    onAgentThought: jam.handleAgentThought,
    onAgentStatus: jam.handleAgentStatus,
    onMusicalContextUpdate: jam.handleMusicalContextUpdate,
    onJamStateUpdate: jam.handleJamStateUpdate,
  });

  const handleAudioReady = useCallback(() => {
    setAudioReady(true);
  }, []);

  const handlePlay = useCallback(() => {
    evaluate(true);
    setIsPlaying(true);
  }, [evaluate]);

  const handleSendDirective = useCallback((text: string, targetAgent?: string) => {
    addBossDirective(text, targetAgent);
    claude.sendBossDirective(text, targetAgent, selectedAgents);
  }, [addBossDirective, claude.sendBossDirective, selectedAgents]);

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
          if (audioReady) {
            handlePlay();
          }
        } else if (e.key === '.') {
          e.preventDefault();
          if (audioReady && isPlaying) {
            handleStop();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [audioReady, isPlaying, handlePlay, handleStop]);

  return (
    <main className="flex flex-col h-screen overflow-hidden">
      {/* Top section: swaps based on jam mode */}
      <div className="flex flex-1 min-h-0 min-w-0">
        {jam.isJamming ? (
          <div className="flex flex-col flex-1 min-h-0 min-w-0">
            {/* Top bar: controls + musical context */}
            <JamTopBar
              musicalContext={jam.musicalContext}
              onStopJam={jam.stopJam}
            />

            {/* Agent columns grid */}
            <div
              className="flex-1 min-h-0 grid gap-px bg-gray-700 overflow-hidden"
              style={{ gridTemplateColumns: `repeat(${jam.selectedAgents.length}, minmax(0, 1fr))` }}
            >
              {jam.selectedAgents.map((key) => (
                <AgentColumn
                  key={key}
                  agentKey={key}
                  agentState={jam.agentStates[key]}
                  messages={agentMessages[key] ?? []}
                />
              ))}
            </div>

            {/* Boss input bar */}
            <BossInputBar
              selectedAgents={jam.selectedAgents}
              isConnected={claude.isConnected}
              isJamming={jam.isJamming}
              onSendDirective={handleSendDirective}
            />

            {/* Pattern display */}
            <PatternDisplay
              agentStates={jam.agentStates}
              selectedAgents={jam.selectedAgents}
            />
          </div>
        ) : (
          <>
            {/* Normal mode: terminal on left */}
            <TerminalPanel
              lines={claude.lines}
              status={claude.status}
              isConnected={claude.isConnected}
              sendMessage={claude.sendMessage}
              clearLines={claude.clearLines}
              className="w-1/3 min-w-[300px] border-r border-gray-700"
            />

            {/* Normal mode: content on right */}
            <div className="flex-1 flex flex-col items-center p-8 relative overflow-y-auto">
              <h1 className="text-4xl font-bold mb-4">CC Sick Beats</h1>
              <p className="text-gray-400 text-lg mb-8">
                AI-assisted live coding music with Strudel
              </p>

              {/* Error banner */}
              {(wsError || error) && (
                <div className="w-full max-w-4xl mb-4 bg-red-900/50 border border-red-500 rounded-lg p-3">
                  <p className="text-red-200 text-sm font-mono">{wsError || error}</p>
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
                isJamming={jam.isJamming}
                isClaudeConnected={claude.isConnected}
                onStartJam={requestStartJam}
                onStopJam={jam.stopJam}
                className="w-full max-w-4xl mb-4"
              />
            </div>
          </>
        )}
      </div>

      {/* Bottom: StrudelPanel always rendered (prevents audio interruption on mode switch) */}
      <div className={`border-t border-gray-700 shrink-0 ${jam.isJamming ? 'h-0 overflow-hidden' : ''}`}>
        <StrudelPanel
          ref={ref}
          initialCode={`// Welcome to CC Sick Beats!
// Press play or Ctrl+Enter to start
note("c3 e3 g3 c4").sound("piano")._pianoroll({ fold: 1 })`}
          className="rounded-none overflow-hidden"
          onError={handleStrudelError}
          onPlayStateChange={handlePlayStateChange}
          onReady={onEditorReady}
        />
      </div>

      {/* Agent selection modal */}
      {jam.showAgentSelection && (
        <AgentSelectionModal
          onConfirm={confirmStartJam}
          onCancel={cancelStartJam}
          initialSelection={jam.selectedAgents}
        />
      )}

      {!audioReady && <AudioStartButton onAudioReady={handleAudioReady} />}
    </main>
  );
}
