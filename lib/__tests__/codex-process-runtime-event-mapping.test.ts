import { describe, expect, it } from 'vitest';
import {
  map_codex_event_to_runtime_events,
  normalize_codex_event_type,
} from '../codex-process';

describe('normalize_codex_event_type', () => {
  it('normalizes slash, underscore, and camelCase separators', () => {
    expect(normalize_codex_event_type('item/agentMessage/delta')).toBe('item.agent.message.delta');
    expect(normalize_codex_event_type('item_mcp_tool_call_progress')).toBe('item.mcp.tool.call.progress');
  });
});

describe('map_codex_event_to_runtime_events', () => {
  it('maps agent message deltas to text events', () => {
    const result = map_codex_event_to_runtime_events(
      {
        type: 'item/agentMessage/delta',
        delta: { text: 'hello world' },
      },
      { saw_assistant_delta: false }
    );

    expect(result.events).toEqual([
      { type: 'text', text: 'hello world' },
    ]);
    expect(result.next_state.saw_assistant_delta).toBe(true);
    expect(result.assistant_fragments).toEqual(['hello world']);
  });

  it('maps mcp tool progress and completion events', () => {
    const progress = map_codex_event_to_runtime_events(
      {
        type: 'item/mcpToolCall/progress',
        name: 'execute_pattern',
        input: { code: 's("bd")' },
        state: 'started',
      },
      { saw_assistant_delta: false }
    );

    expect(progress.events).toEqual([
      {
        type: 'tool_use',
        toolName: 'execute_pattern',
        toolInput: { code: 's("bd")' },
      },
    ]);

    const completed = map_codex_event_to_runtime_events(
      {
        type: 'item.completed',
        item: {
          type: 'mcp_tool_call',
          name: 'execute_pattern',
          input: { code: 's("bd")' },
          result: 'ok',
        },
      },
      { saw_assistant_delta: false }
    );

    expect(completed.events).toEqual([
      {
        type: 'tool_use',
        toolName: 'execute_pattern',
        toolInput: { code: 's("bd")' },
      },
      { type: 'tool_result', text: 'ok' },
    ]);
  });

  it('maps turn completion and failure to done status', () => {
    const done = map_codex_event_to_runtime_events(
      {
        type: 'turn.completed',
        duration_ms: 1200,
        usage: { cost_usd: 0.0123 },
      },
      { saw_assistant_delta: false }
    );

    expect(done.turn_completed).toBe(true);
    expect(done.events).toEqual([
      {
        type: 'status',
        status: 'done',
        metrics: {
          duration_ms: 1200,
          cost_usd: 0.0123,
        },
      },
    ]);

    const failed = map_codex_event_to_runtime_events(
      {
        type: 'turn.failed',
        error: { message: 'network unavailable' },
      },
      { saw_assistant_delta: false }
    );

    expect(failed.turn_completed).toBe(true);
    expect(failed.events).toEqual([
      { type: 'error', error: 'network unavailable' },
      { type: 'status', status: 'done' },
    ]);
  });

  it('maps top-level error events to runtime error messages', () => {
    const errored = map_codex_event_to_runtime_events(
      {
        type: 'error',
        message: 'profile not found',
      },
      { saw_assistant_delta: false }
    );

    expect(errored.turn_completed).toBe(false);
    expect(errored.events).toEqual([
      { type: 'error', error: 'profile not found' },
    ]);
  });
});
