'use client';

import { AGENT_META } from '@/lib/types';

interface MentionSuggestionsProps {
  agents: string[];
  selectedIndex: number;
  onSelect: (agentKey: string) => void;
}

export function MentionSuggestions({ agents, selectedIndex, onSelect }: MentionSuggestionsProps) {
  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 mx-4">
      <div className="bg-stage-dark border border-stage-border rounded-lg shadow-xl overflow-hidden">
        {agents.map((key, i) => {
          const meta = AGENT_META[key];
          if (!meta) return null;
          const isSelected = i === selectedIndex;
          return (
            <button
              key={key}
              onMouseDown={(e) => {
                e.preventDefault(); // prevent blur before click fires
                onSelect(key);
              }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                isSelected ? 'bg-stage-mid text-white' : 'text-stage-text hover:bg-stage-mid/50'
              }`}
            >
              <span>{meta.emoji}</span>
              <span className={`font-semibold ${meta.colors.accent}`}>{meta.mention}</span>
              <span className="text-stage-muted text-xs ml-auto">{meta.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
