'use client';

import type { AgentState } from '@/lib/types';
import { BandMemberCard } from './BandMemberCard';

interface BandPanelProps {
  agentStates: Record<string, AgentState>;
  className?: string;
}

const AGENT_ORDER = ['drums', 'bass', 'melody', 'fx'] as const;

export function BandPanel({ agentStates, className = '' }: BandPanelProps) {
  return (
    <div className={`grid grid-cols-2 gap-3 ${className}`} data-testid="band-panel">
      {AGENT_ORDER.map((key) => {
        const state = agentStates[key];
        if (!state) return null;
        return <BandMemberCard key={key} agentKey={key} agentState={state} />;
      })}
    </div>
  );
}
