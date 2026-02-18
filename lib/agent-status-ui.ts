import type { AgentState } from './types';

export interface AgentStatusDisplay {
  color_class: string;
  label: string;
}

export function get_agent_status_display(status: AgentState['status']): AgentStatusDisplay {
  switch (status) {
    case 'thinking':
      return { color_class: 'bg-yellow-500 animate-pulse', label: 'thinking' };
    case 'playing':
      return { color_class: 'bg-green-500 animate-pulse-gentle', label: 'playing' };
    case 'error':
      return { color_class: 'bg-red-500', label: 'error' };
    case 'timeout':
      return { color_class: 'bg-orange-500', label: 'timeout' };
    default:
      return { color_class: 'bg-gray-500', label: 'idle' };
  }
}
