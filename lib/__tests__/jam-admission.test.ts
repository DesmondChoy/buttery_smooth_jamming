import { describe, it, expect } from 'vitest';
import { evaluate_jam_admission } from '../jam-admission';

describe('evaluate_jam_admission', () => {
  it('allows jam start when under both limits', () => {
    const result = evaluate_jam_admission({
      active_jams: 0,
      active_agent_processes: 0,
      existing_client_agents: 0,
      requested_agents: 4,
      max_concurrent_jams: 1,
      max_total_agent_processes: 4,
    });

    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.details.projected_jams).toBe(1);
      expect(result.details.projected_agent_processes).toBe(4);
    }
  });

  it('rejects jam start when projected jams exceed max_concurrent_jams', () => {
    const result = evaluate_jam_admission({
      active_jams: 1,
      active_agent_processes: 4,
      existing_client_agents: 0,
      requested_agents: 2,
      max_concurrent_jams: 1,
      max_total_agent_processes: 8,
    });

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.code).toBe('jam_capacity_exceeded');
      expect(result.details.projected_jams).toBe(2);
    }
  });

  it('rejects jam start when projected agent processes exceed max_total_agent_processes', () => {
    const result = evaluate_jam_admission({
      active_jams: 1,
      active_agent_processes: 4,
      existing_client_agents: 0,
      requested_agents: 3,
      max_concurrent_jams: 3,
      max_total_agent_processes: 6,
    });

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.code).toBe('agent_capacity_exceeded');
      expect(result.details.projected_agent_processes).toBe(7);
    }
  });

  it('replacing an existing client jam does not double-count jam or agents', () => {
    const result = evaluate_jam_admission({
      active_jams: 1,
      active_agent_processes: 4,
      existing_client_agents: 4,
      requested_agents: 2,
      max_concurrent_jams: 1,
      max_total_agent_processes: 4,
    });

    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.details.projected_jams).toBe(1);
      expect(result.details.projected_agent_processes).toBe(2);
    }
  });
});
