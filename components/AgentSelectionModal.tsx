'use client';

import { useState, useCallback, useEffect } from 'react';
import { AGENT_META } from '@/lib/types';

interface AgentSelectionModalProps {
  onConfirm: (agents: string[]) => void;
  onCancel: () => void;
  initialSelection?: string[];
}

const AGENT_KEYS = Object.keys(AGENT_META);

const AGENT_HINTS: Record<string, string> = {
  drums: 'Syncopation-obsessed, provides the rhythmic foundation',
  bass: 'Selfless minimalist who locks in with the kick drum',
  melody: 'Classically trained, insists on harmonic correctness',
  chords: 'Comping specialist, fills the harmonic middle',
};

export function AgentSelectionModal({
  onConfirm,
  onCancel,
  initialSelection = AGENT_KEYS,
}: AgentSelectionModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelection));

  const toggle = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key); // at least 1 required
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    // Preserve order from AGENT_KEYS
    const agents = AGENT_KEYS.filter((k) => selected.has(k));
    onConfirm(agents);
  }, [selected, onConfirm]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirm();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, handleConfirm]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-stage-black border border-stage-border rounded-xl p-6 w-full max-w-md shadow-2xl shadow-amber-500/5">
        <h2 className="text-xl font-display font-bold text-white mb-1">Start Jam Session</h2>
        <p className="text-sm text-stage-text mb-5">Choose which agents join the jam</p>

        <div className="space-y-2 mb-6">
          {AGENT_KEYS.map((key) => {
            const meta = AGENT_META[key];
            const isSelected = selected.has(key);
            return (
              <button
                key={key}
                onClick={() => toggle(key)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors text-left ${
                  isSelected
                    ? `border-stage-border bg-stage-mid/50 ${meta.colors.accent}`
                    : 'border-stage-border bg-stage-dark/50 text-stage-muted'
                }`}
              >
                <span className="text-xl">{meta.emoji}</span>
                <div className="flex-1">
                  <span className="font-semibold block">{meta.name}</span>
                  <span className="text-xs text-stage-text">{AGENT_HINTS[key]}</span>
                </div>
                <div
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                    isSelected ? 'border-current bg-current/20' : 'border-stage-muted'
                  }`}
                >
                  {isSelected && (
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 bg-stage-dark hover:bg-stage-mid text-stage-text rounded-lg font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-stage-black rounded-lg font-medium transition-colors"
          >
            Start Jam ({selected.size} agent{selected.size !== 1 ? 's' : ''})
          </button>
        </div>

        <p className="text-xs text-stage-muted text-center mt-3">
          Enter to confirm / Esc to cancel
        </p>
      </div>
    </div>
  );
}
