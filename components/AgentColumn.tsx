'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { CSSProperties } from 'react';
import type { AgentState, JamChatMessage } from '@/lib/types';
import { AGENT_META } from '@/lib/types';
import { get_agent_status_display } from '@/lib/agent-status-ui';

interface AgentColumnProps {
  agentKey: string;
  agentState: AgentState;
  isMuted?: boolean;
  messages: JamChatMessage[];
  isPatternChange?: boolean;
}

function StatusDot({
  status,
  agentKey,
  isMuted = false,
}: {
  status: AgentState['status'];
  agentKey?: string;
  isMuted?: boolean;
}) {
  const { color_class, label } = get_agent_status_display(isMuted ? 'muted' : status);

  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2 h-2 rounded-full ${color_class}`} />
      <span className="text-xs text-stage-muted" {...(agentKey ? { 'data-testid': `status-label-${agentKey}` } : {})}>{label}</span>
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
        <div className="px-2 py-1 text-xs text-stage-muted italic">
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
        <span className="text-xs text-stage-muted italic">{message.text}</span>
      </div>
    );
  }

  const isCommentary = message.type === 'agent_commentary';

  return (
    <div className="px-2 py-1">
      {isCommentary && (
        <div className="flex items-baseline gap-1">
          <span className="text-xs text-stage-muted">(commentary)</span>
        </div>
      )}
      <p className={`text-xs ${isCommentary ? 'text-stage-text italic' : 'text-stage-text'}`}>
        {message.text}
      </p>
      {message.pattern && (
        <code className={`block text-xs font-mono mt-0.5 truncate ${meta?.colors.accent ?? 'text-stage-muted'}`}>
          {message.pattern}
        </code>
      )}
    </div>
  );
}

const AGENT_GLOW_STYLES: Record<string, string> = {
  drums: 'rgba(248, 113, 113, 0.45)',
  bass: 'rgba(96, 165, 250, 0.45)',
  melody: 'rgba(163, 163, 163, 0.45)',
  chords: 'rgba(232, 121, 249, 0.45)',
};

export function AgentColumn({
  agentKey,
  agentState,
  isMuted = false,
  messages,
  isPatternChange = false,
}: AgentColumnProps) {
  const meta = AGENT_META[agentKey];
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const glowColor = AGENT_GLOW_STYLES[agentKey] ?? 'rgba(245, 158, 11, 0.35)';

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
    <div
      data-testid={`agent-column-${agentKey}`}
      className={`flex flex-col min-h-0 min-w-0 bg-stage-black border border-stage-border ${
        isPatternChange ? 'agent-pattern-change-glow' : ''
      }`}
      style={{ '--agent-glow-color': glowColor } as CSSProperties}
    >
      {/* Header */}
      <div className={`flex items-center justify-between px-3 py-2 border-b border-stage-border ${meta.colors.bgSolid} shrink-0`}>
        <div className="flex items-center gap-2">
          <span className="text-base">{meta.emoji}</span>
          <span className={`text-sm font-bold ${meta.colors.accent}`}>{meta.name}</span>
        </div>
        <StatusDot status={agentState.status} agentKey={agentKey} isMuted={isMuted} />
      </div>

      {/* Message list */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        data-testid={`agent-messages-${agentKey}`}
        className="flex-1 overflow-y-auto overflow-x-hidden space-y-0.5 py-1"
      >
        {messages.length === 0 ? (
          <div className="text-stage-muted italic text-xs px-2 py-4 text-center">
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
