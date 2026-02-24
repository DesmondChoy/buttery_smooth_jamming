import { afterEach, describe, expect, it } from 'vitest';
import { getRuntimeProvider } from '../runtime-factory';

const original_runtime_provider = process.env.NORMAL_RUNTIME_PROVIDER;

afterEach(() => {
  if (original_runtime_provider === undefined) {
    delete process.env.NORMAL_RUNTIME_PROVIDER;
  } else {
    process.env.NORMAL_RUNTIME_PROVIDER = original_runtime_provider;
  }
});

describe('getRuntimeProvider', () => {
  it('defaults to codex when unset', () => {
    delete process.env.NORMAL_RUNTIME_PROVIDER;
    expect(getRuntimeProvider()).toBe('codex');
  });

  it('supports explicit claude override', () => {
    process.env.NORMAL_RUNTIME_PROVIDER = 'claude';
    expect(getRuntimeProvider()).toBe('claude');
  });

  it('falls back to codex for unknown provider values', () => {
    process.env.NORMAL_RUNTIME_PROVIDER = 'unknown';
    expect(getRuntimeProvider()).toBe('codex');
  });
});
