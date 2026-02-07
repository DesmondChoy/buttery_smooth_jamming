'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { AgentState, JamChatMessage } from '@/lib/types';
import { AGENT_META } from '@/lib/types';

interface AgentColumnProps {
  agentKey: string;
  agentState: AgentState;
  messages: JamChatMessage[];
}

function StatusDot({ status }: { status: AgentState['status'] }) {
  const color = (() => {
    switch (status) {
      case 'thinking': return 'bg-yellow-500 animate-pulse';
      case 'playing':  return 'bg-green-500 animate-pulse-gentle';
      case 'error':    return 'bg-red-500';
      case 'timeout':  return 'bg-red-500';
      default:         return 'bg-gray-500';
    }
  })();

  const label = (() => {
    switch (status) {
      case 'thinking': return 'thinking';
      case 'playing':  return 'playing';
      case 'error':    return 'error';
      case 'timeout':  return 'timeout';
      default:         return 'idle';
    }
  })();

  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2 h-2 rounded-full ${color}`} />
      <span className="text-xs text-gray-500">{label}</span>
    </div>
  );
}

function ColumnMessage({ message, agentKey }: { message: JamChatMessage; agentKey: string }) {
  const meta = AGENT_META[agentKey];

  if (message.type === 'boss_directive') {
    const isTargeted = message.targetAgent === agentKey;
    const isForOther = message.targetAgent && message.targetAgent !== agentKey;

    if (isForOther) {
      const targetMeta = AGENT_META[message.targetAgent!];
      return (
        <div className="px-2 py-1 text-xs text-gray-600 italic">
          BOSS spoke to {targetMeta?.name ?? message.targetAgent} privately.
        </div>
      );
    }

    return (
      <div className="px-2 py-1.5 bg-amber-900/20 border-l-2 border-amber-500/50">
        <span className="text-xs text-amber-400 font-semibold">
          BOSS{isTargeted ? ' (to you)' : ''}
        </span>
        <p className="text-xs text-amber-200">{message.text}</p>
      </div>
    );
  }

  if (message.type === 'system') {
    return (
      <div className="px-2 py-1 text-center">
        <span className="text-xs text-gray-600 italic">{message.text}</span>
      </div>
    );
  }

  const isReaction = message.type === 'agent_reaction';

  return (
    <div className="px-2 py-1">
      <div className="flex items-baseline gap-1">
        {isReaction && <span className="text-xs text-gray-600">(reacting)</span>}
        <span className="text-xs text-gray-600 ml-auto">R{message.round}</span>
      </div>
      <p className={`text-xs ${isReaction ? 'text-gray-400 italic' : 'text-gray-300'}`}>
        {message.text}
      </p>
      {message.pattern && (
        <code className={`block text-xs font-mono mt-0.5 truncate ${meta?.colors.accent ?? 'text-gray-500'}`}>
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

export function AgentColumn({ agentKey, agentState, messages }: AgentColumnProps) {
  const meta = AGENT_META[agentKey];
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    autoScrollRef.current = distanceFromBottom < 50;
  }, []);

  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (!meta) return null;

  return (
    <div className="flex flex-col min-h-0 min-w-0 overflow-hidden bg-gray-900">
      {/* Header */}
      <div className={`flex items-center justify-between px-3 py-2 border-b border-gray-700 ${meta.colors.bgSolid} shrink-0`}>
        <div className="flex items-center gap-2">
          <span className="text-base">{meta.emoji}</span>
          <span className={`text-sm font-bold ${meta.colors.accent}`}>{meta.name}</span>
        </div>
        <StatusDot status={agentState.status} />
      </div>

      {/* Message list */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden space-y-0.5 py-1"
      >
        {messages.length === 0 ? (
          <div className="text-gray-600 italic text-xs px-2 py-4 text-center">
            Waiting for {meta.name}...
          </div>
        ) : (
          messages.map((msg) => (
            <ColumnMessage key={msg.id} message={msg} agentKey={agentKey} />
          ))
        )}
      </div>
    </div>
  );
}
