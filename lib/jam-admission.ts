export interface JamAdmissionInput {
  active_jams: number;
  active_agent_processes: number;
  existing_client_agents: number;
  requested_agents: number;
  max_concurrent_jams: number;
  max_total_agent_processes: number;
}

export interface JamCapacityDetails {
  active_jams: number;
  projected_jams: number;
  max_concurrent_jams: number;
  active_agent_processes: number;
  projected_agent_processes: number;
  max_total_agent_processes: number;
  existing_client_agents: number;
  requested_agents: number;
}

export type JamAdmissionDecision =
  | {
      allowed: true;
      details: JamCapacityDetails;
    }
  | {
      allowed: false;
      code: 'jam_capacity_exceeded' | 'agent_capacity_exceeded';
      message: string;
      details: JamCapacityDetails;
    };

export function evaluate_jam_admission(input: JamAdmissionInput): JamAdmissionDecision {
  const projected_jams = input.active_jams + (input.existing_client_agents > 0 ? 0 : 1);
  const projected_agent_processes =
    input.active_agent_processes - input.existing_client_agents + input.requested_agents;

  const details: JamCapacityDetails = {
    active_jams: input.active_jams,
    projected_jams,
    max_concurrent_jams: input.max_concurrent_jams,
    active_agent_processes: input.active_agent_processes,
    projected_agent_processes,
    max_total_agent_processes: input.max_total_agent_processes,
    existing_client_agents: input.existing_client_agents,
    requested_agents: input.requested_agents,
  };

  if (projected_jams > input.max_concurrent_jams) {
    return {
      allowed: false,
      code: 'jam_capacity_exceeded',
      message: `Jam capacity reached (${input.max_concurrent_jams}). Please stop an existing jam and try again.`,
      details,
    };
  }

  if (projected_agent_processes > input.max_total_agent_processes) {
    return {
      allowed: false,
      code: 'agent_capacity_exceeded',
      message: `Agent process capacity reached (${input.max_total_agent_processes}). Reduce selected agents or stop another jam.`,
      details,
    };
  }

  return {
    allowed: true,
    details,
  };
}
