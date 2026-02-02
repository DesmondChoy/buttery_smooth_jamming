'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { ChatPanel } from '@/components/ChatPanel';
import { AudioStartButton } from '@/components/AudioStartButton';
import { useWebSocket, useStrudel } from '@/hooks';
import type { ChatMessage } from '@/lib/types';

const StrudelPanel = dynamic(
  () => import('@/components/StrudelPanel'),
  { ssr: false }
);

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [audioReady, setAudioReady] = useState(false);

  const { ref, setCode, evaluate, stop } = useStrudel();

  const handleExecute = useCallback((code: string) => {
    setCode(code);
    evaluate(true);
  }, [setCode, evaluate]);

  const handleStop = useCallback(() => {
    stop();
  }, [stop]);

  const handleMessage = useCallback((message: ChatMessage) => {
    setMessages(prev => [...prev, message]);
  }, []);

  const { isConnected } = useWebSocket({
    onExecute: handleExecute,
    onStop: handleStop,
    onMessage: handleMessage,
  });

  const handleAudioReady = useCallback(() => {
    setAudioReady(true);
  }, []);

  return (
    <main className="flex min-h-screen">
      <ChatPanel
        messages={messages}
        isConnected={isConnected}
        className="w-1/3 min-w-[300px] border-r border-gray-700"
      />
      <div className="flex-1 flex flex-col items-center p-8 relative">
        <h1 className="text-4xl font-bold mb-4">CC Sick Beats</h1>
        <p className="text-gray-400 text-lg mb-8">
          AI-assisted live coding music with Strudel
        </p>
        <div className="w-full max-w-4xl">
          <StrudelPanel
            ref={ref}
            initialCode={`// Welcome to CC Sick Beats!
// Press play or Ctrl+Enter to start
note("c3 e3 g3 c4").sound("piano")`}
            className="rounded-lg overflow-hidden"
          />
        </div>
        {!audioReady && <AudioStartButton onAudioReady={handleAudioReady} />}
      </div>
    </main>
  );
}
