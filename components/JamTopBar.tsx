'use client';

import type { MusicalContext } from '@/lib/types';

interface JamTopBarProps {
  musicalContext: MusicalContext;
  onStopJam: () => void;
}

export function JamTopBar({
  musicalContext,
  onStopJam,
}: JamTopBarProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-gray-800 border-b border-gray-700 shrink-0">
      {/* Stop button */}
      <button
        onClick={onStopJam}
        className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-md text-sm font-medium transition-colors shrink-0"
      >
        Stop
      </button>

      {/* Separator */}
      <div className="w-px h-5 bg-gray-600 shrink-0" />

      {/* Musical context */}
      <div className="flex items-center gap-3 text-sm overflow-hidden">
        {musicalContext.genre && (
          <span className="bg-purple-600/30 text-purple-300 px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap">
            {musicalContext.genre}
          </span>
        )}
        <span className="text-white font-semibold whitespace-nowrap">{musicalContext.key}</span>
        <span className="text-gray-400 whitespace-nowrap">
          <span className="text-white font-mono">{musicalContext.bpm}</span> BPM
        </span>
        {musicalContext.chordProgression.length > 0 && (
          <div className="flex items-center gap-1 overflow-hidden">
            {musicalContext.chordProgression.slice(0, 4).map((chord, i) => (
              <span
                key={`${chord}-${i}`}
                className="bg-gray-700/50 px-1.5 py-0.5 rounded text-xs text-gray-300 font-mono whitespace-nowrap"
              >
                {chord}
              </span>
            ))}
          </div>
        )}
        {/* Energy mini-bar */}
        <div className="flex items-center gap-0.5 shrink-0">
          <span className="text-xs text-gray-500">E:</span>
          {Array.from({ length: 10 }, (_, i) => {
            const level = i + 1;
            const active = level <= musicalContext.energy;
            const color = level <= 3 ? 'bg-green-500' : level <= 6 ? 'bg-yellow-500' : 'bg-red-500';
            return (
              <div
                key={level}
                className={`w-1.5 h-2.5 rounded-sm ${active ? color : 'bg-gray-700'}`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
