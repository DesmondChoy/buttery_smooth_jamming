'use client';

import { useCallback } from 'react';

interface JamControlsProps {
  isJamming: boolean;
  currentRound: number;
  roundProgress: number;
  roundDuration: number;
  isClaudeConnected: boolean;
  onStartJam: () => void;
  onStopJam: () => void;
  onRoundDurationChange: (ms: number) => void;
  className?: string;
}

export function JamControls({
  isJamming,
  currentRound,
  roundProgress,
  roundDuration,
  isClaudeConnected,
  onStartJam,
  onStopJam,
  onRoundDurationChange,
  className = '',
}: JamControlsProps) {
  const timeRemaining = Math.max(0, Math.ceil((1 - roundProgress) * roundDuration / 1000));
  const durationSeconds = Math.round(roundDuration / 1000);

  const handleDurationChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onRoundDurationChange(Number(e.target.value));
    },
    [onRoundDurationChange]
  );

  return (
    <div className={`bg-gray-800 border border-gray-700 rounded-lg p-4 ${className}`}>
      {/* Top row: Start/Stop button, round info */}
      <div className="flex items-center gap-4 mb-3">
        {isJamming ? (
          <button
            onClick={onStopJam}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium transition-colors"
          >
            Stop Jam
          </button>
        ) : (
          <button
            onClick={onStartJam}
            disabled={!isClaudeConnected}
            className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Start Jam
          </button>
        )}

        {isJamming && (
          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-300">
              Round: <span className="text-white font-mono">{currentRound}</span>
            </span>
            <span className="text-gray-400">
              Next: <span className="text-white font-mono">{timeRemaining}s</span>
            </span>
          </div>
        )}

        {!isClaudeConnected && !isJamming && (
          <span className="text-sm text-gray-500">Connect to Claude to start a jam</span>
        )}
      </div>

      {/* Progress bar */}
      {isJamming && (
        <div className="w-full h-2 bg-gray-700 rounded-full mb-3 overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-[width] duration-100 ease-linear"
            style={{ width: `${roundProgress * 100}%` }}
          />
        </div>
      )}

      {/* Duration slider */}
      <div className="flex items-center gap-3 text-sm">
        <span className="text-gray-400 whitespace-nowrap">
          Round: <span className="text-white font-mono">{durationSeconds}s</span>
        </span>
        <input
          type="range"
          min={8000}
          max={30000}
          step={1000}
          value={roundDuration}
          onChange={handleDurationChange}
          className="flex-1 h-1.5 bg-gray-600 rounded-full appearance-none cursor-pointer
                     [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                     [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
        />
      </div>
    </div>
  );
}
