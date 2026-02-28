import { describe, expect, it } from 'vitest';

import {
  apply_camera_sample_freshness,
  build_conductor_interpretation_result,
  get_camera_interpreter_output_schema,
  normalize_camera_directive_payload,
  normalize_interpreted_directive,
  parse_camera_interpreter_jsonl_output,
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

  it('classifies command exit diagnostics as model_execution_failure', () => {
    const result = build_conductor_interpretation_result(
      null,
      'interpreted',
      { parse_error: 'Model exited with code 1: invalid_json_schema' }
    );

    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('model_execution_failure');
  });

  it('keeps output schema required fields aligned with declared properties', () => {
    const schema = get_camera_interpreter_output_schema();
    const propertyNames = Object.keys(schema.properties);

    expect(schema.required.length).toBe(propertyNames.length);
    expect(schema.required).toEqual(expect.arrayContaining(propertyNames));
  });

  it('extracts assistant payload and error detail from codex jsonl output', () => {
    const output = [
      '{"type":"thread.started","thread_id":"abc"}',
      '{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"{\\"directive\\":\\"tighten groove\\",\\"confidence\\":0.9,\\"target_agent\\":null,\\"rationale\\":null,\\"reason\\":null}"}}',
      '{"type":"turn.failed","error":{"message":"invalid_json_schema"}}',
    ].join('\n');

    const parsed = parse_camera_interpreter_jsonl_output(output);
    expect(parsed.saw_jsonl).toBe(true);
    expect(parsed.assistant_json_text).toContain('"directive":"tighten groove"');
    expect(parsed.error_text).toContain('invalid_json_schema');
  });

  it('treats null and "all" targets as broadcast during interpretation normalization', () => {
    const nullTarget = normalize_interpreted_directive({
      directive: 'ease density',
      confidence: 0.86,
      target_agent: null,
      rationale: null,
      reason: null,
    });
    const allTarget = normalize_interpreted_directive({
      directive: 'open up dynamics',
      confidence: 0.9,
      target_agent: 'all',
      rationale: 'wide body movement',
      reason: null,
    });
    const drumsTarget = normalize_interpreted_directive({
      directive: 'add kick syncopation',
      confidence: 0.91,
      target_agent: 'drums',
      rationale: null,
      reason: null,
    });

    expect(nullTarget?.targetAgent).toBeUndefined();
    expect(allTarget?.targetAgent).toBeUndefined();
    expect(drumsTarget?.targetAgent).toBe('drums');
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
