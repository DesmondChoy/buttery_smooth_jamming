'use client';

import { useState, useCallback, useEffect } from 'react';
import { AGENT_META } from '@/lib/types';

interface AgentSelectionModalProps {
  onConfirm: (agents: string[]) => void;
  onCancel: () => void;
  initialSelection?: string[];
}

const AGENT_KEYS = Object.keys(AGENT_META);

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
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md shadow-2xl">
        <h2 className="text-xl font-bold text-white mb-1">Start Jam Session</h2>
        <p className="text-sm text-gray-400 mb-5">Choose which agents join the jam</p>

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
                    ? `${meta.colors.border} ${meta.colors.bg} ${meta.colors.accent}`
                    : 'border-gray-700 bg-gray-800/50 text-gray-500'
                }`}
              >
                <span className="text-xl">{meta.emoji}</span>
                <span className="font-semibold flex-1">{meta.name}</span>
                <div
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                    isSelected ? 'border-current bg-current/20' : 'border-gray-600'
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
            className="flex-1 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-lg font-medium transition-colors"
          >
            Start Jam ({selected.size} agent{selected.size !== 1 ? 's' : ''})
          </button>
        </div>

        <p className="text-xs text-gray-600 text-center mt-3">
          Enter to confirm / Esc to cancel
        </p>
      </div>
    </div>
  );
}
