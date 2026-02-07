'use client';

import { useEffect, useRef, useState, useCallback, FormEvent } from 'react';
import type { JamChatMessage } from '@/lib/types';

interface JamChatProps {
  messages: JamChatMessage[];
  isJamming: boolean;
  isConnected: boolean;
  onSendDirective: (text: string) => void;
  className?: string;
}

const AGENT_COLORS: Record<string, string> = {
  drums:  'text-red-400',
  bass:   'text-blue-400',
  melody: 'text-purple-400',
  fx:     'text-green-400',
};

function ChatMessage({ message }: { message: JamChatMessage }) {
  if (message.type === 'boss_directive') {
    return (
      <div className="px-3 py-1.5 bg-amber-900/20 border-l-2 border-amber-500/50">
        <span className="text-xs text-amber-400 font-semibold">BOSS</span>
        <p className="text-sm text-amber-200">{message.text}</p>
      </div>
    );
  }

  if (message.type === 'system') {
    return (
      <div className="px-3 py-1 text-center">
        <span className="text-xs text-gray-500 italic">{message.text}</span>
      </div>
    );
  }

  const agentColor = message.agent ? AGENT_COLORS[message.agent] ?? 'text-gray-400' : 'text-gray-400';
  const isReaction = message.type === 'agent_reaction';

  return (
    <div className="px-3 py-1.5">
      <div className="flex items-baseline gap-1.5">
        {message.emoji && <span className="text-sm">{message.emoji}</span>}
        <span className={`text-xs font-semibold ${agentColor}`}>
          {message.agentName ?? message.agent}
        </span>
        {isReaction && <span className="text-xs text-gray-600">(reacting)</span>}
        <span className="text-xs text-gray-600 ml-auto">R{message.round}</span>
      </div>
      <p className={`text-sm ${isReaction ? 'text-gray-400 italic' : 'text-gray-300'} mt-0.5`}>
        {message.text}
      </p>
      {message.pattern && (
        <code className="block text-xs text-gray-500 font-mono mt-1 truncate">
          {message.pattern}
        </code>
      )}
      {message.compliedWithBoss === false && (
        <span className="text-xs text-amber-400 mt-0.5 inline-block">
          did not follow directive
        </span>
      )}
    </div>
  );
}

export function JamChat({
  messages,
  isJamming,
  isConnected,
  onSendDirective,
  className = '',
}: JamChatProps) {
  const [inputValue, setInputValue] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const inputRef = useRef<HTMLInputElement>(null);

  // Track scroll position to pause auto-scroll when user scrolls up
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    autoScrollRef.current = distanceFromBottom < 50;
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const trimmed = inputValue.trim();
      if (trimmed) {
        onSendDirective(trimmed);
        setInputValue('');
      }
    },
    [inputValue, onSendDirective]
  );

  return (
    <div className={`flex flex-col h-full bg-gray-900 font-mono ${className}`} data-testid="jam-chat">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800 shrink-0">
        <h2 className="text-lg font-semibold text-white">Jam Chat</h2>
        <span className="text-xs text-gray-500">{messages.length} messages</span>
      </header>

      {/* Scrolling message area */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto space-y-1 py-2"
      >
        {messages.length === 0 ? (
          <div className="text-gray-500 italic text-sm px-3 py-4 text-center">
            {isJamming
              ? 'Waiting for agents to respond...'
              : 'Start a jam to see agent thoughts here'}
          </div>
        ) : (
          messages.map((msg) => <ChatMessage key={msg.id} message={msg} />)
        )}
      </div>

      {/* Boss directive input */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center border-t border-gray-700 bg-gray-800 shrink-0"
      >
        <span className="text-amber-400 px-4 py-3 text-sm">BOSS</span>
        <input
          ref={inputRef}
          data-testid="boss-input"
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={
            !isConnected
              ? 'Connecting...'
              : !isJamming
                ? 'Start a jam first...'
                : 'Give the band a directive...'
          }
          disabled={!isConnected || !isJamming}
          className="flex-1 bg-transparent text-white py-3 pr-4 outline-none placeholder-gray-500 disabled:opacity-50 text-sm"
          aria-label="Boss directive input"
        />
        <button
          type="submit"
          disabled={!isConnected || !isJamming || !inputValue.trim()}
          className="px-4 py-3 text-amber-400 hover:text-amber-300 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          aria-label="Send directive"
        >
          Send
        </button>
      </form>
    </div>
  );
}
