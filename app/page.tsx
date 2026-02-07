'use client';

import { useState, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { TerminalPanel } from '@/components/TerminalPanel';
import { JamControls } from '@/components/JamControls';
import { BandPanel } from '@/components/BandPanel';
import { MusicalContextBar } from '@/components/MusicalContextBar';
import { JamChat } from '@/components/JamChat';
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

  // Lift useClaudeTerminal to page level so sendJamTick is accessible
  const claude = useClaudeTerminal({ onToolUse: handleToolUse });

  const jam = useJamSession({
    sendJamTick: claude.sendJamTick,
    isClaudeConnected: claude.isConnected,
  });

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

  // Handle incoming chat messages from MCP send_message broadcasts
  const handleWsMessage = useCallback((msg: { id: string; text: string; timestamp: Date; sender: string }) => {
    if (!jam.isJamming) return;

    // Parse agent emoji + name from text format: "🥁 BEAT: ..." or "🎵 Round N: ..."
    const agentPatterns: Record<string, { agent: string; name: string; emoji: string }> = {
      '🥁': { agent: 'drums', name: 'BEAT', emoji: '🥁' },
      '🎸': { agent: 'bass', name: 'GROOVE', emoji: '🎸' },
      '🎹': { agent: 'melody', name: 'ARIA', emoji: '🎹' },
      '🎛️': { agent: 'fx', name: 'GLITCH', emoji: '🎛️' },
    };

    const text = msg.text;
    let matched = false;
    for (const [emoji, info] of Object.entries(agentPatterns)) {
      if (text.startsWith(emoji)) {
        // Strip "🥁 BEAT: " prefix from text
        const colonIdx = text.indexOf(':');
        const cleanText = colonIdx > -1 ? text.slice(colonIdx + 1).trim() : text;
        jam.addChatMessage({
          type: 'agent_reaction',
          agent: info.agent,
          agentName: info.name,
          emoji: info.emoji,
          text: cleanText,
          round: jam.currentRound,
        });
        matched = true;
        break;
      }
    }

    if (!matched) {
      jam.addChatMessage({
        type: 'system',
        text,
        round: jam.currentRound,
      });
    }
  }, [jam.isJamming, jam.currentRound, jam.addChatMessage]);

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

  const handleSendDirective = useCallback((text: string) => {
    jam.addBossDirective(text);
    claude.sendMessage(text);
  }, [jam.addBossDirective, claude.sendMessage]);

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
      <div className="flex flex-1 min-h-0">
        {jam.isJamming ? (
          <>
            {/* Jam mode: left sidebar with band info */}
            <aside className="w-[380px] min-w-[320px] border-r border-gray-700 overflow-y-auto p-4 space-y-4 shrink-0 bg-gray-900">
              <BandPanel agentStates={jam.agentStates} />
              <JamControls
                isJamming={jam.isJamming}
                currentRound={jam.currentRound}
                roundProgress={jam.roundProgress}
                roundDuration={jam.roundDuration}
                isClaudeConnected={claude.isConnected}
                onStartJam={jam.startJam}
                onStopJam={jam.stopJam}
                onRoundDurationChange={jam.setRoundDuration}
              />
              <MusicalContextBar musicalContext={jam.musicalContext} />
            </aside>

            {/* Jam mode: chat area */}
            <JamChat
              messages={jam.chatMessages}
              isJamming={jam.isJamming}
              isConnected={claude.isConnected}
              onSendDirective={handleSendDirective}
              className="flex-1"
            />
          </>
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
                currentRound={jam.currentRound}
                roundProgress={jam.roundProgress}
                roundDuration={jam.roundDuration}
                isClaudeConnected={claude.isConnected}
                onStartJam={jam.startJam}
                onStopJam={jam.stopJam}
                onRoundDurationChange={jam.setRoundDuration}
                className="w-full max-w-4xl mb-4"
              />
            </div>
          </>
        )}
      </div>

      {/* Bottom: StrudelPanel always rendered (prevents audio interruption on mode switch) */}
      <div className="border-t border-gray-700 shrink-0">
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

      {!audioReady && <AudioStartButton onAudioReady={handleAudioReady} />}
    </main>
  );
}
