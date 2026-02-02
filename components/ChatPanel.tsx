'use client';

import { useEffect, useRef, useState, FormEvent, KeyboardEvent } from 'react';
import { ChatMessage } from '@/lib/types';

interface ChatPanelProps {
  messages: ChatMessage[];
  isConnected: boolean;
  onSendMessage?: (text: string) => void;
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

  const isUser = message.sender === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-lg p-4 ${
          isUser
            ? 'bg-blue-600 rounded-br-sm'
            : 'bg-gray-700 rounded-bl-sm'
        }`}
      >
        <p className="text-white whitespace-pre-wrap">{message.text}</p>
        <time
          dateTime={message.timestamp.toISOString()}
          className={`text-xs mt-2 block ${
            isUser ? 'text-blue-200' : 'text-gray-400'
          }`}
        >
          {formattedTime}
        </time>
      </div>
    </div>
  );
}

export function ChatPanel({ messages, isConnected, onSendMessage, className = '' }: ChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (trimmed && onSendMessage) {
      onSendMessage(trimmed);
      setInputValue('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

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

      <form onSubmit={handleSubmit} className="p-4 border-t border-gray-700">
        <div className="flex gap-2">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isConnected ? 'Ask Claude for a beat...' : 'Disconnected...'}
            disabled={!isConnected}
            rows={2}
            className="flex-1 bg-gray-700 text-white rounded-lg px-4 py-2 resize-none placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={!isConnected || !inputValue.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Press Enter to send, Shift+Enter for new line
        </p>
      </form>
    </div>
  );
}
