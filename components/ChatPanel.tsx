'use client';

import { useEffect, useRef } from 'react';
import { ChatMessage } from '@/lib/types';

interface ChatPanelProps {
  messages: ChatMessage[];
  isConnected: boolean;
  className?: string;
}

function ConnectionIndicator({ isConnected }: { isConnected: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-2 h-2 rounded-full ${
          isConnected ? 'bg-green-500' : 'bg-red-500'
        }`}
        aria-hidden="true"
      />
      <span className="text-sm text-gray-400">
        {isConnected ? 'Connected' : 'Disconnected'}
      </span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center text-gray-500">
      <p className="text-center px-4">
        No messages yet. Claude will send messages here as you interact.
      </p>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const formattedTime = message.timestamp.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="bg-gray-700 rounded-lg p-4">
      <p className="text-white whitespace-pre-wrap">{message.text}</p>
      <time
        dateTime={message.timestamp.toISOString()}
        className="text-xs text-gray-400 mt-2 block"
      >
        {formattedTime}
      </time>
    </div>
  );
}

export function ChatPanel({ messages, isConnected, className = '' }: ChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className={`flex flex-col h-full bg-gray-800 ${className}`}>
      <header className="flex items-center justify-between p-4 border-b border-gray-700">
        <h2 className="text-lg font-semibold text-white">Claude</h2>
        <ConnectionIndicator isConnected={isConnected} />
      </header>

      <div
        className="flex-1 overflow-y-auto p-4 space-y-4"
        role="log"
        aria-live="polite"
        aria-label="Chat messages"
      >
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>
    </div>
  );
}
