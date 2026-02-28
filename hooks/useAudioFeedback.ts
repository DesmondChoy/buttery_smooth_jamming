'use client';

import { useEffect } from 'react';
import type { AudioFeatureSnapshot } from '@/lib/types';

interface AudioAnalysisState {
  context: AudioContext;
  analyser: AnalyserNode;
  silentSink: GainNode;
  timeData: Float32Array;
  freqData: Uint8Array;
  prevFreqData: Float32Array | null;
  windowMs: number;
  zeroSignalStreak: number;
}

export interface UseAudioFeedbackOptions {
  enabled: boolean;
  isAudioRunning: boolean;
  onFeedback: (snapshot: AudioFeatureSnapshot) => void;
  analysisIntervalMs?: number;
}

const DEFAULT_ANALYSIS_INTERVAL_MS = 1_000;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeFeature(value: number, min: number, max: number): number {
  return clamp(Math.round(value), min, max);
}

function normalizeBandEnergy(value: number): number {
  return normalizeFeature(value * 100, 0, 100);
}

function toLoudnessScore(rms: number): number {
  const db = 20 * Math.log10(Math.max(rms, 1e-9));
  const shifted = db + 96;
  return normalizeFeature(shifted, 0, 100);
}

async function getAudioContext(): Promise<AudioContext | null> {
  try {
    const { getAudioContext: getStrudelAudioContext } = await import('@strudel/webaudio');
    return getStrudelAudioContext();
  } catch {
    return null;
  }
}

async function attachAnalyserToStrudelOutput(
  analyser: AnalyserNode
): Promise<boolean> {
  try {
    const { getSuperdoughAudioController } = await import('superdough');
    const controller = getSuperdoughAudioController() as {
      output?: {
        destinationGain?: AudioNode;
        channelMerger?: AudioNode;
      };
    };
    const output = controller.output;
    const busNode = output?.destinationGain ?? output?.channelMerger;

    if (!busNode) {
      return false;
    }

    busNode.connect(analyser);
    return true;
  } catch (error) {
    console.warn('[AudioFeedback] Could not attach to Strudel output bus:', error);
    return false;
  }
}

function computeFeatures(params: {
  context: AudioContext;
  freqData: Uint8Array<ArrayBufferLike>;
  timeData: Float32Array<ArrayBufferLike>;
  prevFreqData: Float32Array<ArrayBufferLike> | null;
  windowMs: number;
}): AudioFeatureSnapshot {
  const { context, freqData, timeData, prevFreqData, windowMs } = params;
  const freqLength = freqData.length;
  const sampleRate = context.sampleRate;
  const nyquist = sampleRate / 2;
  const binHz = nyquist / freqLength;

  let rmsAccumulator = 0;
  for (let i = 0; i < timeData.length; i++) {
    rmsAccumulator += timeData[i] * timeData[i];
  }
  const rms = Math.sqrt(rmsAccumulator / Math.max(1, timeData.length));

  let centroidAccumulator = 0;
  let totalMagnitude = 0;
  let low = 0;
  let mid = 0;
  let high = 0;
  let fluxAccumulator = 0;

  let totalPrevMagnitude = 0;
  for (let i = 0; i < freqLength; i++) {
    const magnitude = freqData[i] / 255;
    totalMagnitude += magnitude;

    const freq = i * binHz;
    centroidAccumulator += freq * magnitude;

    if (freq < 250) {
      low += magnitude;
    } else if (freq < 2000) {
      mid += magnitude;
    } else {
      high += magnitude;
    }

    if (prevFreqData) {
      const prev = prevFreqData[i] ?? 0;
      const delta = magnitude - prev;
      if (delta > 0) {
        fluxAccumulator += delta;
      }
      totalPrevMagnitude += prev;
    }
  }

  const centroidHz = totalMagnitude > 0
    ? Math.round(centroidAccumulator / totalMagnitude)
    : 0;

  const lowBandEnergy = totalMagnitude > 0 ? low / totalMagnitude : 0;
  const midBandEnergy = totalMagnitude > 0 ? mid / totalMagnitude : 0;
  const highBandEnergy = totalMagnitude > 0 ? high / totalMagnitude : 0;

  const spectralFluxRaw = totalPrevMagnitude > 0
    ? fluxAccumulator / totalPrevMagnitude
    : 0;
  const onsetDensity = normalizeFeature(spectralFluxRaw * 120, 0, 100);

  return {
    capturedAtMs: Date.now(),
    windowMs,
    loudnessDb: toLoudnessScore(rms),
    spectralCentroidHz: normalizeFeature(centroidHz, 0, 30_000),
    lowBandEnergy: normalizeBandEnergy(lowBandEnergy),
    midBandEnergy: normalizeBandEnergy(midBandEnergy),
    highBandEnergy: normalizeBandEnergy(highBandEnergy),
    spectralFlux: normalizeFeature(spectralFluxRaw * 100, 0, 100),
    onsetDensity,
  };
}

export function useAudioFeedback(options: UseAudioFeedbackOptions): void {
  const {
    enabled,
    isAudioRunning,
    onFeedback,
    analysisIntervalMs = DEFAULT_ANALYSIS_INTERVAL_MS,
  } = options;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      return;
    }

    let timer: ReturnType<typeof setInterval> | null = null;
    let mounted = true;
    let analysisState: AudioAnalysisState | null = null;

    const setup = async () => {
      const context = await getAudioContext();
      if (!context || !mounted) {
        return;
      }

      if (!analysisState || analysisState.context !== context) {
        const analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.7;
        const silentSink = context.createGain();
        // Keep analyser processing in an active graph branch without duplicating audible output.
        silentSink.gain.value = 0;
        analyser.connect(silentSink);
        silentSink.connect(context.destination);

        analysisState = {
          context,
          analyser,
          silentSink,
          timeData: new Float32Array(analyser.fftSize),
          freqData: new Uint8Array(analyser.frequencyBinCount),
          prevFreqData: null,
          windowMs: analysisIntervalMs,
          zeroSignalStreak: 0,
        };

        const attached = await attachAnalyserToStrudelOutput(analyser);
        if (!attached) {
          console.warn('[AudioFeedback] No output source available for analysis.');
          analyser.disconnect();
          silentSink.disconnect();
          analysisState = null;
          return;
        }
      }

      if (!mounted) {
        return;
      }

      const analyze = () => {
        if (!isAudioRunning || !analysisState || analysisState.context.state !== 'running') {
          return;
        }

        const { analyser, freqData, timeData, prevFreqData } = analysisState;
        const byteBuffer = freqData as Uint8Array<ArrayBuffer>;
        const floatBuffer = timeData as Float32Array<ArrayBuffer>;
        analyser.getByteFrequencyData(byteBuffer);
        analyser.getFloatTimeDomainData(floatBuffer);

        const snapshot = computeFeatures({
          context: analysisState.context,
          freqData: byteBuffer,
          timeData: floatBuffer,
          prevFreqData,
          windowMs: analysisState.windowMs,
        });
        const isLikelySilentFrame = snapshot.loudnessDb === 0
          && snapshot.spectralCentroidHz === 0
          && snapshot.lowBandEnergy === 0
          && snapshot.midBandEnergy === 0
          && snapshot.highBandEnergy === 0
          && snapshot.spectralFlux === 0
          && snapshot.onsetDensity === 0;

        if (isLikelySilentFrame) {
          analysisState.zeroSignalStreak += 1;
          if (process.env.NODE_ENV === 'development' && analysisState.zeroSignalStreak === 3) {
            console.warn('[AudioFeedback] Received 3 consecutive zeroed analysis frames while playback is running.', {
              windowMs: analysisState.windowMs,
              contextState: analysisState.context.state,
            });
          }
        } else {
          analysisState.zeroSignalStreak = 0;
        }

        const normalizedPrev = new Float32Array(freqData.length);
        for (let i = 0; i < freqData.length; i++) {
          normalizedPrev[i] = freqData[i] / 255;
        }
        analysisState.prevFreqData = normalizedPrev;

        onFeedback(snapshot);
      };

      timer = setInterval(analyze, analysisIntervalMs);
      analyze();
    };

    setup();

    return () => {
      mounted = false;
      if (timer) {
        clearInterval(timer);
      }
      if (analysisState) {
        analysisState.analyser.disconnect();
        analysisState.silentSink.disconnect();
      }
    };
  }, [enabled, isAudioRunning, onFeedback, analysisIntervalMs]);
}
