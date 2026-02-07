'use client';

import { useCallback } from 'react';
import type { MusicalContext } from '@/lib/types';

interface JamTopBarProps {
  currentRound: number;
  roundProgress: number;
  roundDuration: number;
  musicalContext: MusicalContext;
  onStopJam: () => void;
  onRoundDurationChange: (ms: number) => void;
}

export function JamTopBar({
  currentRound,
  roundProgress,
  roundDuration,
  musicalContext,
  onStopJam,
  onRoundDurationChange,
}: JamTopBarProps) {
  const timeRemaining = Math.max(0, Math.ceil((1 - roundProgress) * roundDuration / 1000));
  const durationSeconds = Math.round(roundDuration / 1000);

  const handleDurationChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onRoundDurationChange(Number(e.target.value));
    },
    [onRoundDurationChange]
  );

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-gray-800 border-b border-gray-700 shrink-0">
      {/* Stop button */}
      <button
        onClick={onStopJam}
        className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-md text-sm font-medium transition-colors shrink-0"
      >
        Stop
      </button>

      {/* Round + timer */}
      <div className="flex items-center gap-3 text-sm shrink-0">
        <span className="text-gray-300">
          Round: <span className="text-white font-mono">{currentRound}</span>
        </span>
        <span className="text-gray-400">
          Next: <span className="text-white font-mono">{timeRemaining}s</span>
        </span>
      </div>

      {/* Progress bar */}
      <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden min-w-[80px] max-w-[200px]">
        <div
          className="h-full bg-blue-500 rounded-full transition-[width] duration-100 ease-linear"
          style={{ width: `${roundProgress * 100}%` }}
        />
      </div>

      {/* Duration slider */}
      <input
        type="range"
        min={8000}
        max={30000}
        step={1000}
        value={roundDuration}
        onChange={handleDurationChange}
        title={`Round duration: ${durationSeconds}s`}
        className="w-16 h-1 bg-gray-600 rounded-full appearance-none cursor-pointer shrink-0
                   [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5
                   [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
      />
      <span className="text-xs text-gray-500 font-mono shrink-0">{durationSeconds}s</span>

      {/* Separator */}
      <div className="w-px h-5 bg-gray-600 shrink-0" />

      {/* Musical context */}
      <div className="flex items-center gap-3 text-sm overflow-hidden">
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
