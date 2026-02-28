'use client';

import { useEffect, useMemo, useState } from 'react';
import type { AutoTickTiming, MusicalContext } from '@/lib/types';
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
  autoTickTiming?: AutoTickTiming | null;
  showAutoTickCountdown?: boolean;
  errorMessage?: string | null;
  isContextInspectorEnabled?: boolean;
  isCameraConductorEnabled?: boolean;
  isCameraConductorReady?: boolean;
  canEnableCameraConductor?: boolean;
  cameraConductorError?: string | null;
  cameraConductorIntentStatus?: string | null;
  onSelectPreset: (presetId: string | null) => void;
  onPlayJam: () => void;
  onStopJam: () => void;
  onToggleContextInspector?: (enabled: boolean) => void;
  onToggleCameraConductor?: (enabled: boolean) => void;
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
  autoTickTiming,
  showAutoTickCountdown = false,
  errorMessage,
  isContextInspectorEnabled = false,
  isCameraConductorEnabled = false,
  isCameraConductorReady = false,
  canEnableCameraConductor = false,
  cameraConductorError,
  cameraConductorIntentStatus = null,
  onSelectPreset,
  onPlayJam,
  onStopJam,
  onToggleContextInspector,
  onToggleCameraConductor,
}: JamTopBarProps) {
  const [clockNowMs, setClockNowMs] = useState<number>(() => Date.now());
  const [localAutoTickDeadlineMs, setLocalAutoTickDeadlineMs] = useState<number | null>(null);

  const selectedPreset = useMemo(
    () => (selectedPresetId ? presets.find((preset) => preset.id === selectedPresetId) ?? null : null),
    [presets, selectedPresetId]
  );

  const presetContext = selectedPreset ? presetToMusicalContext(selectedPreset) : null;
  const displayContext = showPresetPreview
    ? presetContext
    : musicalContext.genre
      ? musicalContext
      : presetContext;

  useEffect(() => {
    const rafId = window.requestAnimationFrame(() => {
      if (!showAutoTickCountdown || !autoTickTiming?.nextTickAtMs) {
        setLocalAutoTickDeadlineMs(null);
        return;
      }

      // Anchor server timing to the local clock at message receipt time.
      const millisUntilTick = Math.max(0, autoTickTiming.nextTickAtMs - autoTickTiming.serverNowMs);
      const now = Date.now();
      setClockNowMs(now);
      setLocalAutoTickDeadlineMs(now + millisUntilTick);
    });

    return () => window.cancelAnimationFrame(rafId);
  }, [
    showAutoTickCountdown,
    autoTickTiming?.nextTickAtMs,
    autoTickTiming?.serverNowMs,
  ]);

  useEffect(() => {
    if (!showAutoTickCountdown || localAutoTickDeadlineMs === null) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setClockNowMs(Date.now());
    }, 200);

    return () => window.clearInterval(intervalId);
  }, [showAutoTickCountdown, localAutoTickDeadlineMs]);

  const autoTickRemainingMs = localAutoTickDeadlineMs === null
    ? null
    : Math.max(0, localAutoTickDeadlineMs - clockNowMs);

  const autoTickIntervalMs = autoTickTiming?.intervalMs ?? 15_000;
  const autoTickSecondsRemaining = autoTickRemainingMs === null
    ? null
    : Math.ceil(autoTickRemainingMs / 1000);
  const autoTickProgressPct = autoTickRemainingMs === null || autoTickIntervalMs <= 0
    ? 0
    : Math.min(100, Math.max(0, ((autoTickIntervalMs - autoTickRemainingMs) / autoTickIntervalMs) * 100));
  const isAutoTickImminent = autoTickRemainingMs !== null && autoTickRemainingMs <= 3_000;

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2 bg-stage-dark border-b border-stage-border shrink-0">
      <label className="flex items-center gap-2 text-sm text-stage-text shrink-0">
        <span className="text-xs uppercase tracking-wide text-stage-muted">Preset</span>
        <select
          value={selectedPresetId ?? ''}
          onChange={(e) => onSelectPreset(e.target.value || null)}
          disabled={isPresetLocked}
          className="bg-stage-black border border-stage-border text-white rounded px-2 py-1 text-sm min-w-[220px] disabled:opacity-60 disabled:cursor-not-allowed"
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

      <button
        onClick={onPlayJam}
        disabled={!canPlayJam}
        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors shrink-0 ${
          isPlaying
            ? 'bg-green-600 text-white'
            : 'bg-stage-mid hover:bg-stage-border text-white'
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

      <button
        onClick={() => onToggleContextInspector?.(!isContextInspectorEnabled)}
        className={`px-2.5 py-1 rounded text-xs font-medium border shrink-0 transition-colors ${
          isContextInspectorEnabled
            ? 'border-amber-400/60 bg-amber-500/15 text-amber-200'
            : 'border-stage-border bg-stage-mid/40 text-stage-text hover:bg-stage-mid/70'
        }`}
      >
        Context Inspector: {isContextInspectorEnabled ? 'On' : 'Off'}
      </button>

      <button
        onClick={() => onToggleCameraConductor?.(!isCameraConductorEnabled)}
        disabled={!canEnableCameraConductor}
        className={`px-2.5 py-1 rounded text-xs font-medium border shrink-0 transition-colors ${
          isCameraConductorEnabled
            ? 'border-cyan-400/60 bg-cyan-500/15 text-cyan-200'
            : 'border-stage-border bg-stage-mid/40 text-stage-text hover:bg-stage-mid/70'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        Camera Conductor: {isCameraConductorEnabled ? 'On' : 'Off'}
      </button>

      {isPresetLocked && (
        <span className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2 py-1 rounded shrink-0">
          Preset locked after first join
        </span>
      )}

      {!isJamReady && (
        <span className="text-xs text-stage-text shrink-0">Starting jam session…</span>
      )}
      {isJamReady && !selectedPresetId && (
        <span className="text-xs text-stage-text shrink-0">Choose a preset to enable Play</span>
      )}
      {isJamReady && selectedPresetId && !isAudioReady && (
        <span className="text-xs text-stage-text shrink-0">Start audio to enable Play</span>
      )}
      {isJamReady && selectedPresetId && isAudioReady && isPresetApplying && (
        <span className="text-xs text-sky-300 bg-sky-500/10 border border-sky-500/30 px-2 py-1 rounded shrink-0">
          Applying preset…
        </span>
      )}
      {showAutoTickCountdown && autoTickSecondsRemaining !== null && (
        <div className="flex items-center gap-2 px-2 py-1 rounded border border-stage-border bg-stage-black/60 shrink-0">
          <span className="text-xs text-stage-muted whitespace-nowrap">Next Autotick in</span>
          <span className={`text-sm font-mono font-semibold whitespace-nowrap ${isAutoTickImminent ? 'text-amber-300' : 'text-stage-text'}`}>
            {autoTickSecondsRemaining}s
          </span>
          <div className="h-1.5 w-20 rounded-full bg-stage-mid overflow-hidden" aria-hidden="true">
            <div
              className={`h-full transition-[width] duration-150 ease-linear ${isAutoTickImminent ? 'bg-amber-400' : 'bg-cyan-400'}`}
              style={{ width: `${autoTickProgressPct}%` }}
            />
          </div>
        </div>
      )}
      {showAutoTickCountdown && autoTickSecondsRemaining === null && (
        <span className="text-xs text-stage-text shrink-0">Syncing autotick...</span>
      )}
      {errorMessage && (
        <span className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 px-2 py-1 rounded shrink-0 max-w-[420px] truncate">
          {errorMessage}
        </span>
      )}
      {cameraConductorError && (
        <span className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 px-2 py-1 rounded shrink-0 max-w-[420px] truncate">
          Camera: {cameraConductorError}
        </span>
      )}
      {cameraConductorIntentStatus && (
        <span className="text-xs text-cyan-200 bg-cyan-500/10 border border-cyan-500/30 px-2 py-1 rounded shrink-0 max-w-[520px] truncate">
          {cameraConductorIntentStatus}
        </span>
      )}
      {canEnableCameraConductor && isCameraConductorEnabled && isCameraConductorReady && (
        <span className="text-xs text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 px-2 py-1 rounded shrink-0">
          Camera ready
        </span>
      )}
      {canEnableCameraConductor && isCameraConductorEnabled && !isCameraConductorReady && (
        <span className="text-xs text-stage-text bg-stage-mid/40 border border-stage-border px-2 py-1 rounded shrink-0">
          Enabling camera…
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
          <span className="text-stage-text whitespace-nowrap">
            <span className="text-white font-mono">{displayContext.bpm}</span> BPM
          </span>
        )}
        {displayContext && displayContext.chordProgression.length > 0 && (
          <div className="flex items-center gap-1 overflow-hidden">
            {displayContext.chordProgression.slice(0, 4).map((chord, i) => (
              <span
                key={`${chord}-${i}`}
                className="bg-stage-mid/50 px-1.5 py-0.5 rounded text-xs text-stage-text font-mono whitespace-nowrap"
              >
                {chord}
              </span>
            ))}
          </div>
        )}
        {displayContext && (
          <div className="flex items-center gap-0.5 shrink-0">
            <span className="text-xs text-stage-muted">E:</span>
            {Array.from({ length: 10 }, (_, i) => {
              const level = i + 1;
              const active = level <= displayContext.energy;
              const color = level <= 3 ? 'bg-green-500' : level <= 6 ? 'bg-yellow-500' : 'bg-red-500';
              return (
                <div
                  key={level}
                  className={`w-1.5 h-2.5 rounded-sm ${active ? color : 'bg-stage-mid'}`}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
