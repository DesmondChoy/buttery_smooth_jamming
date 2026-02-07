'use client';

import type { AgentState } from '@/lib/types';

interface BandMemberCardProps {
  agentKey: string;
  agentState: AgentState;
  className?: string;
}

const AGENT_COLORS: Record<string, { border: string; accent: string; bg: string }> = {
  drums:  { border: 'border-red-500/50',    accent: 'text-red-400',    bg: 'bg-red-500/10' },
  bass:   { border: 'border-blue-500/50',   accent: 'text-blue-400',   bg: 'bg-blue-500/10' },
  melody: { border: 'border-purple-500/50', accent: 'text-purple-400', bg: 'bg-purple-500/10' },
  fx:     { border: 'border-green-500/50',  accent: 'text-green-400',  bg: 'bg-green-500/10' },
};

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

  return <div className={`w-2 h-2 rounded-full ${color}`} />;
}

export function BandMemberCard({ agentKey, agentState, className = '' }: BandMemberCardProps) {
  const colors = AGENT_COLORS[agentKey] ?? AGENT_COLORS.drums;
  const patternPreview = agentState.pattern
    ? agentState.pattern.length > 80
      ? agentState.pattern.slice(0, 80) + '...'
      : agentState.pattern
    : null;
  const thoughtPreview = agentState.thoughts
    ? agentState.thoughts.length > 100
      ? agentState.thoughts.slice(0, 100) + '...'
      : agentState.thoughts
    : null;

  return (
    <div
      className={`border ${colors.border} ${colors.bg} rounded-lg p-3 ${className}`}
      data-testid={`band-member-${agentKey}`}
    >
      {/* Header: emoji + name + status dot */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{agentState.emoji}</span>
          <span className={`text-sm font-semibold ${colors.accent}`}>{agentState.name}</span>
        </div>
        <StatusDot status={agentState.status} />
      </div>

      {/* Pattern preview */}
      <div className="mb-2 min-h-[1.5rem]">
        {patternPreview ? (
          <code className="text-xs text-gray-300 font-mono block truncate">{patternPreview}</code>
        ) : (
          <span className="text-xs text-gray-500 italic">No pattern</span>
        )}
      </div>

      {/* Thought bubble */}
      {thoughtPreview && (
        <p className={`text-xs ${colors.accent} italic truncate`}>{thoughtPreview}</p>
      )}
    </div>
  );
}
