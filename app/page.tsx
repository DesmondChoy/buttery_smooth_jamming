'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { ChatPanel } from '@/components/ChatPanel';
import { AudioStartButton } from '@/components/AudioStartButton';
import { ChatMessage } from '@/lib/types';

const StrudelEditor = dynamic(
  () => import('@/components/StrudelEditor'),
  { ssr: false }
);

// Mock data for testing - remove after WebSocket integration
const MOCK_MESSAGES: ChatMessage[] = [
  {
    id: '1',
    text: 'Welcome to CC Sick Beats! I can help you create music with Strudel.',
    timestamp: new Date(Date.now() - 60000),
  },
  {
    id: '2',
    text: 'Try pressing Ctrl+Enter to play the pattern, or ask me to modify the code!',
    timestamp: new Date(),
  },
];

export default function Home() {
  const [messages] = useState<ChatMessage[]>(MOCK_MESSAGES);
  const [isConnected] = useState(true);
  const [audioReady, setAudioReady] = useState(false);

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
          <StrudelEditor
            initialCode={`// Welcome to CC Sick Beats!
// Press play or Ctrl+Enter to start
note("c3 e3 g3 c4").sound("piano")`}
            onReady={() => {
              // Editor ready - available for future use
            }}
            className="rounded-lg overflow-hidden"
          />
        </div>
        {!audioReady && <AudioStartButton onAudioReady={handleAudioReady} />}
      </div>
    </main>
  );
}
