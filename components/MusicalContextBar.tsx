'use client';

import type { MusicalContext } from '@/lib/types';

interface MusicalContextBarProps {
  musicalContext: MusicalContext;
  className?: string;
}

function EnergyBar({ energy }: { energy: number }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-gray-400 mr-1">Energy</span>
      {Array.from({ length: 10 }, (_, i) => {
        const level = i + 1;
        const active = level <= energy;
        const color = level <= 3 ? 'bg-green-500' : level <= 6 ? 'bg-yellow-500' : 'bg-red-500';
        return (
          <div
            key={level}
            className={`w-2 h-3 rounded-sm ${active ? color : 'bg-gray-700'}`}
          />
        );
      })}
    </div>
  );
}

export function MusicalContextBar({ musicalContext, className = '' }: MusicalContextBarProps) {
  return (
    <div
      className={`bg-gray-800 border border-gray-700 rounded-lg p-3 ${className}`}
      data-testid="musical-context"
    >
      {/* Key + BPM + Time Sig */}
      <div className="flex items-center gap-4 mb-2 text-sm">
        <span className="text-white font-semibold">{musicalContext.key}</span>
        <span className="text-gray-400">
          <span className="text-white font-mono">{musicalContext.bpm}</span> BPM
        </span>
        <span className="text-gray-400">{musicalContext.timeSignature}</span>
      </div>

      {/* Chord Progression */}
      {musicalContext.chordProgression.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          <span className="text-xs text-gray-500 mr-1">Chords</span>
          {musicalContext.chordProgression.map((chord, i) => (
            <span
              key={`${chord}-${i}`}
              className="bg-gray-700/50 px-2 py-0.5 rounded text-xs text-gray-200 font-mono"
            >
              {chord}
            </span>
          ))}
        </div>
      )}

      {/* Energy Bar */}
      <EnergyBar energy={musicalContext.energy} />
    </div>
  );
}
