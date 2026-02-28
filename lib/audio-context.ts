import type { AudioContextSummary, AudioFeatureSnapshot } from './types';

export interface AudioContextSummaryOptions {
  nowMs?: number;
  staleThresholdMs?: number;
}

const DEFAULT_STALE_THRESHOLD_MS = 12_000;
const LEVEL_LOW_MAX = 33;
const LEVEL_HIGH_MIN = 67;
const CENTROID_DARK_MAX = 900;
const CENTROID_BRIGHT_MIN = 2_600;
const SPECTRAL_FLUX_MOTION_THRESHOLD = 15;
const ONSET_DENSITY_MOTION_THRESHOLD = 12;
const BAND_DOMINANCE_MARGIN = 12;

export interface AudioContextFormatterOptions {
  ageMs?: number;
  includeScopeLine?: boolean;
}

export function isLikelyZeroedSnapshot(snapshot: AudioFeatureSnapshot | null | undefined): boolean {
  if (!snapshot) return true;
  return (
    snapshot.loudnessDb === 0
    && snapshot.spectralCentroidHz === 0
    && snapshot.lowBandEnergy === 0
    && snapshot.midBandEnergy === 0
    && snapshot.highBandEnergy === 0
    && snapshot.spectralFlux === 0
    && snapshot.onsetDensity === 0
  );
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function pickLevel(score: number, onsetDensity: number): AudioContextSummary['level'] {
  const loudnessWithOnsetBoost = clamp(score + Math.round(onsetDensity * 0.08), 0, 100);
  if (loudnessWithOnsetBoost <= LEVEL_LOW_MAX) return 'low';
  if (loudnessWithOnsetBoost >= LEVEL_HIGH_MIN) return 'high';
  return 'medium';
}

function pickTexture(snapshot: AudioFeatureSnapshot): AudioContextSummary['texture'] {
  if (snapshot.spectralCentroidHz > 0) {
    if (snapshot.spectralCentroidHz <= CENTROID_DARK_MAX) return 'dark';
    if (snapshot.spectralCentroidHz >= CENTROID_BRIGHT_MIN) return 'bright';
    return 'neutral';
  }

  const dominantBand = Math.max(
    snapshot.lowBandEnergy,
    snapshot.midBandEnergy,
    snapshot.highBandEnergy
  );
  const isDark = snapshot.lowBandEnergy >= dominantBand - BAND_DOMINANCE_MARGIN
    && snapshot.lowBandEnergy > snapshot.highBandEnergy;
  const isBright = snapshot.highBandEnergy >= dominantBand - BAND_DOMINANCE_MARGIN
    && snapshot.highBandEnergy > snapshot.lowBandEnergy;

  if (isDark) return 'dark';
  if (isBright) return 'bright';
  return 'neutral';
}

function pickMotion(snapshot: AudioFeatureSnapshot): AudioContextSummary['motion'] {
  return (snapshot.spectralFlux >= SPECTRAL_FLUX_MOTION_THRESHOLD
    || snapshot.onsetDensity >= ONSET_DENSITY_MOTION_THRESHOLD)
    ? 'moving'
    : 'static';
}

function pickConfidence(params: {
  snapshot: AudioFeatureSnapshot;
  isFresh: boolean;
}): AudioContextSummary['confidence'] {
  if (!params.isFresh) return 'low';

  const featureSignals = [
    params.snapshot.loudnessDb > 0,
    params.snapshot.spectralCentroidHz > 0,
    (params.snapshot.lowBandEnergy + params.snapshot.midBandEnergy + params.snapshot.highBandEnergy) > 0,
    params.snapshot.spectralFlux > 0,
    params.snapshot.onsetDensity > 0,
  ].filter(Boolean).length;

  if (featureSignals >= 5) return 'high';
  if (featureSignals >= 3) return 'medium';
  return 'low';
}

export function deriveAudioContextSummary(
  snapshot: AudioFeatureSnapshot | null | undefined,
  options: AudioContextSummaryOptions = {}
): AudioContextSummary {
  const nowMs = options.nowMs ?? Date.now();
  const staleThresholdMs = options.staleThresholdMs ?? DEFAULT_STALE_THRESHOLD_MS;

  if (!snapshot) {
    return {
      state: 'fallback: music context only',
      level: 'low',
      texture: 'neutral',
      motion: 'static',
      confidence: 'low',
    };
  }

  const isFresh = Number.isFinite(snapshot.capturedAtMs) && (nowMs - snapshot.capturedAtMs) <= staleThresholdMs;
  if (!isFresh || isLikelyZeroedSnapshot(snapshot)) {
    return {
      state: 'fallback: music context only',
      level: 'low',
      texture: snapshot.spectralCentroidHz === 0 ? 'neutral' : pickTexture(snapshot),
      motion: snapshot.spectralFlux === 0 && snapshot.onsetDensity === 0 ? 'static' : pickMotion(snapshot),
      confidence: 'low',
    };
  }

  return {
    state: 'analysis available',
    level: pickLevel(snapshot.loudnessDb, snapshot.onsetDensity),
    texture: pickTexture(snapshot),
    motion: pickMotion(snapshot),
    confidence: pickConfidence({ snapshot, isFresh }),
  };
}

export function formatAudioContextForPrompt(
  summary: AudioContextSummary,
  options: AudioContextFormatterOptions = {}
): string[] {
  const {
    ageMs,
    includeScopeLine = true,
  } = options;
  const ageText = Number.isFinite(ageMs ?? NaN)
    ? ` (${Math.max(0, Math.round((ageMs as number) / 1000))}s old)`
    : '';

  return [
    `AUDIO CONTEXT${ageText}:`,
    `- state: ${summary.state}`,
    `- level: ${summary.level}`,
    `- texture: ${summary.texture}`,
    `- motion: ${summary.motion}`,
    `- confidence: ${summary.confidence}`,
    ...(includeScopeLine
      ? ['- scope: aggregate global mix across ALL active pattern sources in this jam']
      : []),
  ];
}
