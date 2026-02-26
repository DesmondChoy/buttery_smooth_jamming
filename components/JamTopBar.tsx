'use client';

import type { MusicalContext } from '@/lib/types';
import type { JamPreset } from '@/lib/musical-context-presets';
import { presetToMusicalContext } from '@/lib/musical-context-presets';

interface JamTopBarProps {
  musicalContext: MusicalContext;
  presets: JamPreset[];
  selectedPresetId: string | null;
  isPresetLocked: boolean;
  showPresetPreview: boolean;
  canPlayJam: boolean;
  isPlaying: boolean;
  isAudioReady: boolean;
  isJamReady: boolean;
  isPresetApplying: boolean;
  errorMessage?: string | null;
  onSelectPreset: (presetId: string | null) => void;
  onPlayJam: () => void;
  onStopJam: () => void;
}

export function JamTopBar({
  musicalContext,
  presets,
  selectedPresetId,
  isPresetLocked,
  showPresetPreview,
  canPlayJam,
  isPlaying,
  isAudioReady,
  isJamReady,
  isPresetApplying,
  errorMessage,
  onSelectPreset,
  onPlayJam,
  onStopJam,
}: JamTopBarProps) {
  const selectedPreset = selectedPresetId
    ? presets.find((preset) => preset.id === selectedPresetId) ?? null
    : null;

  const presetContext = selectedPreset ? presetToMusicalContext(selectedPreset) : null;
  const displayContext = showPresetPreview
    ? presetContext
    : musicalContext.genre
      ? musicalContext
      : presetContext;

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2 bg-gray-800 border-b border-gray-700 shrink-0">
      <button
        onClick={onPlayJam}
        disabled={!canPlayJam}
        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors shrink-0 ${
          isPlaying
            ? 'bg-green-600 text-white'
            : 'bg-gray-700 hover:bg-gray-600 text-white'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {isPlaying ? '▶ Playing' : '▶ Play'}
      </button>

      <button
        onClick={onStopJam}
        className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-md text-sm font-medium transition-colors shrink-0"
      >
        Stop
      </button>

      <div className="w-px h-5 bg-gray-600 shrink-0" />

      <label className="flex items-center gap-2 text-sm text-gray-300 shrink-0">
        <span className="text-xs uppercase tracking-wide text-gray-500">Preset</span>
        <select
          value={selectedPresetId ?? ''}
          onChange={(e) => onSelectPreset(e.target.value || null)}
          disabled={isPresetLocked}
          className="bg-gray-900 border border-gray-600 text-white rounded px-2 py-1 text-sm min-w-[220px] disabled:opacity-60 disabled:cursor-not-allowed"
          aria-label="Jam genre preset"
        >
          <option value="">Select a genre preset…</option>
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.genre}
            </option>
          ))}
        </select>
      </label>

      {isPresetLocked && (
        <span className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2 py-1 rounded shrink-0">
          Preset locked after first join
        </span>
      )}

      {!isJamReady && (
        <span className="text-xs text-gray-400 shrink-0">Starting jam session…</span>
      )}
      {isJamReady && !selectedPresetId && (
        <span className="text-xs text-gray-400 shrink-0">Choose a preset to enable Play</span>
      )}
      {isJamReady && selectedPresetId && !isAudioReady && (
        <span className="text-xs text-gray-400 shrink-0">Start audio to enable Play</span>
      )}
      {isJamReady && selectedPresetId && isAudioReady && isPresetApplying && (
        <span className="text-xs text-sky-300 bg-sky-500/10 border border-sky-500/30 px-2 py-1 rounded shrink-0">
          Applying preset…
        </span>
      )}
      {errorMessage && (
        <span className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 px-2 py-1 rounded shrink-0 max-w-[420px] truncate">
          {errorMessage}
        </span>
      )}

      <div className="flex items-center gap-3 text-sm overflow-hidden min-w-0">
        {displayContext?.genre && (
          <span className="bg-purple-600/30 text-purple-300 px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap">
            {displayContext.genre}
          </span>
        )}
        {displayContext?.key && (
          <span className="text-white font-semibold whitespace-nowrap">{displayContext.key}</span>
        )}
        {displayContext && (
          <span className="text-gray-400 whitespace-nowrap">
            <span className="text-white font-mono">{displayContext.bpm}</span> BPM
          </span>
        )}
        {displayContext && displayContext.chordProgression.length > 0 && (
          <div className="flex items-center gap-1 overflow-hidden">
            {displayContext.chordProgression.slice(0, 4).map((chord, i) => (
              <span
                key={`${chord}-${i}`}
                className="bg-gray-700/50 px-1.5 py-0.5 rounded text-xs text-gray-300 font-mono whitespace-nowrap"
              >
                {chord}
              </span>
            ))}
          </div>
        )}
        {displayContext && (
          <div className="flex items-center gap-0.5 shrink-0">
            <span className="text-xs text-gray-500">E:</span>
            {Array.from({ length: 10 }, (_, i) => {
              const level = i + 1;
              const active = level <= displayContext.energy;
              const color = level <= 3 ? 'bg-green-500' : level <= 6 ? 'bg-yellow-500' : 'bg-red-500';
              return (
                <div
                  key={level}
                  className={`w-1.5 h-2.5 rounded-sm ${active ? color : 'bg-gray-700'}`}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
