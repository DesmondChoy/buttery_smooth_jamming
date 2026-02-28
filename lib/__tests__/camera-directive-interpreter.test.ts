import { describe, expect, it } from 'vitest';

import {
  apply_camera_sample_freshness,
  build_conductor_interpretation_result,
  normalize_camera_directive_payload,
} from '../camera-directive-interpreter';
import type { CameraDirectivePayload } from '../types';

function build_payload(capturedAtMs: number, isStale?: boolean): CameraDirectivePayload {
  return {
    sample: {
      capturedAtMs,
      sampleIntervalMs: 400,
      frameWidth: 160,
      frameHeight: 120,
      motion: {
        score: 0.5,
        left: 0.25,
        right: 0.75,
        top: 0.4,
        bottom: 0.6,
        centroidX: 0.5,
        centroidY: 0.55,
        maxDelta: 0.9,
      },
      ...(isStale === undefined ? {} : { isStale }),
      face: {
        present: false,
        motion: 0,
        areaRatio: 0,
        stability: 1,
      },
    },
  };
}

describe('camera-directive-interpreter', () => {
  it('classifies stale sample diagnostics as stale_sample reason', () => {
    const result = build_conductor_interpretation_result(
      null,
      'interpreted',
      { parse_error: 'Vision sample is stale (extended capture gap).' }
    );

    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('stale_sample');
  });

  it('keeps timeout diagnostics classified as model_execution_failure', () => {
    const result = build_conductor_interpretation_result(
      null,
      'interpreted',
      { parse_error: 'Model execution timed out.' }
    );

    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('model_execution_failure');
  });

  it('keeps invalid output diagnostics classified as model_parse_failure', () => {
    const result = build_conductor_interpretation_result(
      null,
      'interpreted',
      { parse_error: 'Model output shape is invalid.' }
    );

    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('model_parse_failure');
  });

  it('preserves explicit isStale=false during payload normalization', () => {
    const normalized = normalize_camera_directive_payload(build_payload(1_700_000_000_000, false));

    expect(normalized).not.toBeNull();
    expect(normalized?.sample.isStale).toBe(false);
  });

  it('marks old payloads stale via freshness policy helper', () => {
    const staleResult = apply_camera_sample_freshness(build_payload(1_000, false), {
      nowMs: 8_000,
      maxAgeMs: 5_000,
      maxFutureSkewMs: 1_500,
    });

    expect(staleResult.sample.isStale).toBe(true);

    const freshResult = apply_camera_sample_freshness(build_payload(7_000, false), {
      nowMs: 8_000,
      maxAgeMs: 5_000,
      maxFutureSkewMs: 1_500,
    });

    expect(freshResult.sample.isStale).toBe(false);
  });
});
