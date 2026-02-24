import { afterEach, describe, expect, it } from 'vitest';
import { getRuntimeProvider, getRuntimeRolloutStage } from '../runtime-factory';

const original_runtime_provider = process.env.NORMAL_RUNTIME_PROVIDER;
const original_rollout_stage = process.env.NORMAL_RUNTIME_ROLLOUT_STAGE;

afterEach(() => {
  if (original_runtime_provider === undefined) {
    delete process.env.NORMAL_RUNTIME_PROVIDER;
  } else {
    process.env.NORMAL_RUNTIME_PROVIDER = original_runtime_provider;
  }

  if (original_rollout_stage === undefined) {
    delete process.env.NORMAL_RUNTIME_ROLLOUT_STAGE;
  } else {
    process.env.NORMAL_RUNTIME_ROLLOUT_STAGE = original_rollout_stage;
  }
});

describe('getRuntimeProvider', () => {
  it('defaults to codex when unset', () => {
    delete process.env.NORMAL_RUNTIME_PROVIDER;
    delete process.env.NORMAL_RUNTIME_ROLLOUT_STAGE;
    expect(getRuntimeProvider()).toBe('codex');
  });

  it('supports explicit codex override', () => {
    process.env.NORMAL_RUNTIME_PROVIDER = 'codex';
    expect(getRuntimeProvider()).toBe('codex');
  });

  it('falls back to codex for unknown provider values', () => {
    process.env.NORMAL_RUNTIME_PROVIDER = 'unknown';
    delete process.env.NORMAL_RUNTIME_ROLLOUT_STAGE;
    expect(getRuntimeProvider()).toBe('codex');
  });

  it('uses codex default during pre-gate rollout stage', () => {
    delete process.env.NORMAL_RUNTIME_PROVIDER;
    process.env.NORMAL_RUNTIME_ROLLOUT_STAGE = 'pre_gate';
    expect(getRuntimeProvider()).toBe('codex');
  });
});

describe('getRuntimeRolloutStage', () => {
  it('defaults to post_gate when unset', () => {
    delete process.env.NORMAL_RUNTIME_ROLLOUT_STAGE;
    expect(getRuntimeRolloutStage()).toBe('post_gate');
  });

  it('supports pre_gate override', () => {
    process.env.NORMAL_RUNTIME_ROLLOUT_STAGE = 'pre_gate';
    expect(getRuntimeRolloutStage()).toBe('pre_gate');
  });

  it('falls back to post_gate for unknown values', () => {
    process.env.NORMAL_RUNTIME_ROLLOUT_STAGE = 'unknown';
    expect(getRuntimeRolloutStage()).toBe('post_gate');
  });
});
