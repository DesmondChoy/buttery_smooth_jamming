'use client';

import { useState, useCallback } from 'react';
import type { AgentState } from '@/lib/types';
import { AGENT_META } from '@/lib/types';

interface PatternDisplayProps {
  agentStates: Record<string, AgentState>;
  selectedAgents: string[];
}

export function PatternDisplay({ agentStates, selectedAgents }: PatternDisplayProps) {
  const [collapsed, setCollapsed] = useState(false);

  const toggle = useCallback(() => setCollapsed((prev) => !prev), []);

  const activePatterns = selectedAgents
    .map((key) => ({ key, state: agentStates[key], meta: AGENT_META[key] }))
    .filter((a) => a.state && a.meta);

  return (
    <div data-testid="pattern-display" className="border-t border-stage-border bg-stage-black shrink-0">
      <button
        onClick={toggle}
        className="w-full flex items-center gap-2 px-4 py-1.5 text-xs text-stage-muted hover:text-stage-text transition-colors"
      >
        <span className={`transition-transform ${collapsed ? '' : 'rotate-90'}`}>&#9654;</span>
        <span>Patterns</span>
      </button>
      {!collapsed && (
        <div className="px-4 pb-2 space-y-0.5">
          {activePatterns.map(({ key, state, meta }) => (
            <div key={key} data-testid={`pattern-row-${key}`} className="flex items-baseline gap-2 font-mono text-xs">
              <span className="shrink-0">
                {meta.emoji} <span className={meta.colors.accent}>{meta.name}:</span>
              </span>
              <code className="text-stage-text truncate">
                {state.pattern || <span className="text-stage-muted italic">silence</span>}
              </code>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
