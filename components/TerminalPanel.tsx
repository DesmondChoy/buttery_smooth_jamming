'use client';

import { useEffect, useRef, useState, useCallback, FormEvent, KeyboardEvent } from 'react';
import type { RuntimeStatus, TerminalLine } from '@/hooks/useRuntimeTerminal';

interface TerminalPanelProps {
  lines: TerminalLine[];
  status: RuntimeStatus;
  isConnected: boolean;
  sendMessage: (text: string) => void;
  clearLines: () => void;
  className?: string;
}

function StatusIndicator({ status, isConnected }: { status: RuntimeStatus; isConnected: boolean }) {
  const getStatusColor = () => {
    if (!isConnected) return 'bg-red-500';
    switch (status) {
      case 'ready':
        return 'bg-green-500';
      case 'thinking':
        return 'bg-yellow-500 animate-pulse';
      case 'connecting':
        return 'bg-blue-500 animate-pulse';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusText = () => {
    if (!isConnected) return 'Disconnected';
    switch (status) {
      case 'ready':
        return 'Ready';
      case 'thinking':
        return 'Thinking...';
      case 'connecting':
        return 'Connecting...';
      case 'done':
        return 'Ready';
      case 'error':
        return 'Error';
      default:
        return status;
    }
  };

  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
      <span className="text-sm text-stage-text">{getStatusText()}</span>
    </div>
  );
}

function TerminalLineDisplay({ line }: { line: TerminalLine }) {
  const getLineStyles = () => {
    switch (line.type) {
      case 'user':
        return 'text-blue-400';
      case 'assistant':
        return 'text-green-300';
      case 'tool':
        return 'text-yellow-400 font-mono text-sm';
      case 'status':
        return 'text-stage-muted italic';
      case 'error':
        return 'text-red-400';
      default:
        return 'text-white';
    }
  };

  const getPrefix = () => {
    switch (line.type) {
      case 'user':
        return '> ';
      case 'assistant':
        return '';
      case 'tool':
        return '  ';
      case 'status':
        return '  ';
      case 'error':
        return '! ';
      default:
        return '';
    }
  };

  return (
    <div className={`${getLineStyles()} whitespace-pre-wrap break-words`}>
      <span className="text-stage-muted">{getPrefix()}</span>
      {line.text}
    </div>
  );
}

export function TerminalPanel({
  lines,
  status,
  isConnected,
  sendMessage,
  clearLines,
  className = '',
}: TerminalPanelProps) {
  const [inputValue, setInputValue] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when new lines are added
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const trimmed = inputValue.trim();
      if (trimmed) {
        sendMessage(trimmed);
        setInputValue('');
      }
    },
    [inputValue, sendMessage]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'l' && e.ctrlKey) {
        e.preventDefault();
        clearLines();
      }
    },
    [clearLines]
  );

  const handleContainerClick = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div
      className={`flex flex-col h-full bg-stage-black font-mono ${className}`}
      onClick={handleContainerClick}
    >
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-stage-border bg-stage-dark">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-white">Runtime Terminal</h2>
          <span className="text-xs text-stage-muted">Ctrl+L to clear</span>
        </div>
        <StatusIndicator status={status} isConnected={isConnected} />
      </header>

      {/* Terminal output area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-2 text-sm"
        role="log"
        aria-live="polite"
        aria-label="Runtime terminal output"
      >
        {lines.length === 0 ? (
          <div className="text-stage-muted italic">
            Ask the runtime to create music patterns. Try: &quot;Make me a funky beat&quot;
          </div>
        ) : (
          lines.map((line) => <TerminalLineDisplay key={line.id} line={line} />)
        )}
      </div>

      {/* Input area */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center border-t border-stage-border bg-stage-dark"
      >
        <span className="text-amber-glow px-4 py-3">&gt;</span>
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isConnected
              ? status === 'thinking'
                ? 'Runtime is thinking...'
                : 'Type your request...'
              : 'Connecting...'
          }
          disabled={!isConnected || status === 'thinking'}
          className="flex-1 bg-transparent text-white py-3 pr-4 outline-none placeholder-stage-muted disabled:opacity-50"
          aria-label="Chat input"
        />
        <button
          type="submit"
          disabled={!isConnected || !inputValue.trim() || status === 'thinking'}
          className="px-4 py-3 text-amber-glow hover:text-amber-warm disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Send message"
        >
          Send
        </button>
      </form>
    </div>
  );
}
