import { describe, it, expect } from 'vitest';
import { JAM_GOVERNANCE } from '../jam-governance-constants';

describe('JAM_GOVERNANCE invariants', () => {
  it('BPM bounds are ordered and positive', () => {
    expect(JAM_GOVERNANCE.BPM_MIN).toBeGreaterThan(0);
    expect(JAM_GOVERNANCE.BPM_MAX).toBeGreaterThan(JAM_GOVERNANCE.BPM_MIN);
  });

  it('energy bounds are exactly 1-10', () => {
    expect(JAM_GOVERNANCE.ENERGY_MIN).toBe(1);
    expect(JAM_GOVERNANCE.ENERGY_MAX).toBe(10);
  });

  it('tempo delta bounds are symmetric around zero', () => {
    expect(JAM_GOVERNANCE.TEMPO_DELTA_PCT_MIN).toBeLessThan(0);
    expect(JAM_GOVERNANCE.TEMPO_DELTA_PCT_MAX).toBeGreaterThan(0);
    expect(JAM_GOVERNANCE.TEMPO_DELTA_PCT_MAX).toBe(-JAM_GOVERNANCE.TEMPO_DELTA_PCT_MIN);
  });

  it('energy delta bounds are symmetric around zero', () => {
    expect(JAM_GOVERNANCE.ENERGY_DELTA_MIN).toBeLessThan(0);
    expect(JAM_GOVERNANCE.ENERGY_DELTA_MAX).toBeGreaterThan(0);
    expect(JAM_GOVERNANCE.ENERGY_DELTA_MAX).toBe(-JAM_GOVERNANCE.ENERGY_DELTA_MIN);
  });

  it('confidence multipliers: low=0, high=1, medium in (0,1)', () => {
    expect(JAM_GOVERNANCE.CONFIDENCE_MULTIPLIER.low).toBe(0);
    expect(JAM_GOVERNANCE.CONFIDENCE_MULTIPLIER.high).toBe(1);
    expect(JAM_GOVERNANCE.CONFIDENCE_MULTIPLIER.medium).toBeGreaterThan(0);
    expect(JAM_GOVERNANCE.CONFIDENCE_MULTIPLIER.medium).toBeLessThan(1);
  });

  it('auto-tick dampening is in (0, 1]', () => {
    expect(JAM_GOVERNANCE.AUTO_TICK_DAMPENING).toBeGreaterThan(0);
    expect(JAM_GOVERNANCE.AUTO_TICK_DAMPENING).toBeLessThanOrEqual(1);
  });

  it('key consensus requires at least 2 agents', () => {
    expect(JAM_GOVERNANCE.KEY_CONSENSUS_MIN_AGENTS).toBeGreaterThanOrEqual(2);
  });

  it('agent timeout is positive and at most equal to auto-tick interval', () => {
    expect(JAM_GOVERNANCE.AGENT_TIMEOUT_MS).toBeGreaterThan(0);
    expect(JAM_GOVERNANCE.AGENT_TIMEOUT_MS).toBeLessThanOrEqual(JAM_GOVERNANCE.AUTO_TICK_INTERVAL_MS);
  });
});
