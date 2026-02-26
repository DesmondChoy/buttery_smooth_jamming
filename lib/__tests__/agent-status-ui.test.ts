import { describe, expect, it } from 'vitest';
import { get_agent_status_display } from '../agent-status-ui';

describe('get_agent_status_display', () => {
  it('maps idle to gray with idle label', () => {
    const result = get_agent_status_display('idle');
    expect(result).toEqual({
      color_class: 'bg-gray-500',
      label: 'idle',
    });
  });

  it('maps thinking to yellow pulse', () => {
    const result = get_agent_status_display('thinking');
    expect(result).toEqual({
      color_class: 'bg-yellow-500 animate-pulse',
      label: 'thinking',
    });
  });

  it('maps playing to green gentle pulse', () => {
    const result = get_agent_status_display('playing');
    expect(result).toEqual({
      color_class: 'bg-green-500 animate-pulse-gentle',
      label: 'playing',
    });
  });

  it('maps muted to a neutral dot with muted label', () => {
    const result = get_agent_status_display('muted');
    expect(result).toEqual({
      color_class: 'bg-slate-400',
      label: 'muted',
    });
  });

  it('maps error to red with error label', () => {
    const result = get_agent_status_display('error');
    expect(result).toEqual({
      color_class: 'bg-red-500',
      label: 'error',
    });
  });

  it('maps timeout to orange with timeout label', () => {
    const result = get_agent_status_display('timeout');
    expect(result).toEqual({
      color_class: 'bg-orange-500',
      label: 'timeout',
    });
  });
});
