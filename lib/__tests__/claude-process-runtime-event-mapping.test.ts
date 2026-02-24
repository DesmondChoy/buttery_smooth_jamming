import { describe, expect, it } from 'vitest';
import {
  ClaudeMessage,
  map_claude_message_to_runtime_events,
} from '../claude-process';

describe('map_claude_message_to_runtime_events', () => {
  it('maps assistant content blocks into normalized runtime events', () => {
    const message: ClaudeMessage = {
      type: 'assistant',
      message: {
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet',
        stop_reason: 'end_turn',
        content: [
          { type: 'text', text: 'hello' },
          { type: 'tool_use', name: 'execute_pattern', input: { code: 's("bd")' } },
          { type: 'tool_result', text: 'ok' },
        ],
      },
    };

    const events = map_claude_message_to_runtime_events(message);
    expect(events).toEqual([
      { type: 'text', text: 'hello' },
      {
        type: 'tool_use',
        toolName: 'execute_pattern',
        toolInput: { code: 's("bd")' },
      },
      { type: 'tool_result', text: 'ok' },
    ]);
  });

  it('maps init system message to ready status', () => {
    const message: ClaudeMessage = {
      type: 'system',
      subtype: 'init',
    };

    const events = map_claude_message_to_runtime_events(message);
    expect(events).toEqual([
      { type: 'status', status: 'ready' },
    ]);
  });

  it('maps result message to done status with metrics', () => {
    const message: ClaudeMessage = {
      type: 'result',
      duration_ms: 980,
      cost_usd: 0.0123,
    };

    const events = map_claude_message_to_runtime_events(message);
    expect(events).toEqual([
      {
        type: 'status',
        status: 'done',
        metrics: {
          duration_ms: 980,
          cost_usd: 0.0123,
        },
      },
    ]);
  });
});
