import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import type {
  RuntimeEvent,
  RuntimeProcess,
  RuntimeProcessOptions,
} from './runtime-process';
import {
  assert_codex_runtime_ready,
  build_codex_overrides,
  CODEX_NORMAL_PROFILE,
  load_project_codex_config,
} from './codex-runtime-checks';

const DEFAULT_WS_URL = 'ws://localhost:3000/api/ws';
const HISTORY_LIMIT = 12;
const NORMAL_MODE_SYSTEM_PROMPT_FILE = 'normal-mode-system-prompt.md';
const NORMAL_MODE_PROMPT_DIR_CANDIDATES = [
  ['.codex', 'agents'],
] as const;

export type CodexProcessOptions = RuntimeProcessOptions & {
  model?: string;
};

interface ConversationEntry {
  role: 'user' | 'assistant';
  text: string;
}

interface CodexJsonEvent {
  type?: unknown;
  item?: unknown;
  error?: unknown;
  message?: unknown;
  [key: string]: unknown;
}

function resolve_normal_mode_prompt_path(root_dir: string): string | null {
  for (const segments of NORMAL_MODE_PROMPT_DIR_CANDIDATES) {
    const candidate = path.join(root_dir, ...segments, NORMAL_MODE_SYSTEM_PROMPT_FILE);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function load_system_prompt(working_dir: string): string {
  const search_roots = [working_dir, process.cwd()];
  const visited = new Set<string>();
  const attempted_paths: string[] = [];

  for (const root of search_roots) {
    if (!root || visited.has(root)) continue;
    visited.add(root);
    for (const segments of NORMAL_MODE_PROMPT_DIR_CANDIDATES) {
      attempted_paths.push(path.join(root, ...segments, NORMAL_MODE_SYSTEM_PROMPT_FILE));
    }
    const prompt_path = resolve_normal_mode_prompt_path(root);
    if (!prompt_path) continue;

    const prompt = fs.readFileSync(prompt_path, 'utf-8').trim();
    if (!prompt) {
      throw new Error(`Normal mode system prompt is empty: ${prompt_path}`);
    }
    return prompt;
  }

  throw new Error(
    `Normal mode system prompt not found. Tried: ${attempted_paths.join(', ')}`
  );
}

export interface CodexEventParseState {
  saw_assistant_delta: boolean;
}

export interface CodexEventParseResult {
  events: RuntimeEvent[];
  next_state: CodexEventParseState;
  turn_completed: boolean;
  assistant_fragments: string[];
}

function as_record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function compact_dots(value: string): string {
  return value.replace(/\.+/g, '.').replace(/^\./, '').replace(/\.$/, '');
}

export function normalize_codex_event_type(value: unknown): string {
  if (typeof value !== 'string') return '';
  // Compatibility normalizer for Codex CLI event naming variants
  // (slash/underscore/camelCase) so runtime mapping stays deterministic.
  const with_dots = value
    .replace(/\//g, '.')
    .replace(/_/g, '.')
    .replace(/([a-z0-9])([A-Z])/g, '$1.$2')
    .toLowerCase();
  return compact_dots(with_dots);
}

function unique_text(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function extract_text_fragments(value: unknown, depth = 0): string[] {
  if (depth > 6 || value == null) return [];

  if (typeof value === 'string') {
    return value.trim() ? [value] : [];
  }

  if (Array.isArray(value)) {
    return unique_text(value.flatMap((item) => extract_text_fragments(item, depth + 1)));
  }

  const obj = as_record(value);
  if (!obj) return [];

  const direct: string[] = [];
  if (typeof obj.text === 'string') direct.push(obj.text);
  if (typeof obj.output_text === 'string') direct.push(obj.output_text);
  if (typeof obj.content === 'string') direct.push(obj.content);
  if (typeof obj.message === 'string') direct.push(obj.message);
  if (typeof obj.delta === 'string') direct.push(obj.delta);

  if (direct.length > 0) {
    return unique_text(direct);
  }

  const ordered_keys = ['delta', 'content', 'message', 'output', 'result', 'parts', 'items'];
  const nested: string[] = [];

  for (const key of ordered_keys) {
    if (key in obj) {
      nested.push(...extract_text_fragments(obj[key], depth + 1));
    }
  }

  if (nested.length > 0) {
    return unique_text(nested);
  }

  for (const [key, nested_value] of Object.entries(obj)) {
    if (typeof nested_value === 'string' && /(text|content|message|output|result)/i.test(key)) {
      nested.push(nested_value);
      continue;
    }
    if (nested_value && typeof nested_value === 'object') {
      nested.push(...extract_text_fragments(nested_value, depth + 1));
    }
  }

  return unique_text(nested);
}

function get_string_field(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return undefined;
}

function get_number_by_paths(
  source: Record<string, unknown>,
  paths: string[][]
): number | undefined {
  for (const path of paths) {
    let current: unknown = source;
    let failed = false;

    for (const part of path) {
      const record = as_record(current);
      if (!record || !(part in record)) {
        failed = true;
        break;
      }
      current = record[part];
    }

    if (!failed && typeof current === 'number' && Number.isFinite(current)) {
      return current;
    }
  }

  return undefined;
}

function get_record_field(
  obj: Record<string, unknown>,
  keys: string[]
): Record<string, unknown> | undefined {
  for (const key of keys) {
    const value = as_record(obj[key]);
    if (value) return value;
  }
  return undefined;
}

function extract_error_text(event: Record<string, unknown>): string | undefined {
  // Keep this permissive because Codex error payloads vary by event type/version.
  // We surface the raw message verbatim rather than rewriting semantics.
  if (typeof event.message === 'string' && event.message.trim()) {
    return event.message;
  }
  const error = as_record(event.error);
  if (!error) return undefined;
  if (typeof error.message === 'string' && error.message.trim()) {
    return error.message;
  }
  return undefined;
}

function extract_tool_progress_events(event: Record<string, unknown>): RuntimeEvent[] {
  const events: RuntimeEvent[] = [];
  const progress = as_record(event.progress) ?? {};
  const tool_name =
    get_string_field(event, ['name', 'tool_name', 'toolName'])
    ?? get_string_field(progress, ['name', 'tool_name', 'toolName']);
  const tool_input =
    get_record_field(event, ['input', 'arguments', 'args'])
    ?? get_record_field(progress, ['input', 'arguments', 'args']);
  const phase =
    get_string_field(event, ['state', 'status', 'phase', 'event'])
    ?? get_string_field(progress, ['state', 'status', 'phase', 'event'])
    ?? '';
  const normalized_phase = normalize_codex_event_type(phase);

  const result_fragments = unique_text([
    ...extract_text_fragments(event.result),
    ...extract_text_fragments(event.output),
    ...extract_text_fragments(progress.result),
    ...extract_text_fragments(progress.output),
    ...extract_text_fragments(progress.content),
  ]);

  const should_emit_use =
    Boolean(tool_name)
    && (
      normalized_phase.includes('start')
      || normalized_phase.includes('begin')
      || normalized_phase.includes('request')
      || !normalized_phase
      || Boolean(tool_input)
    );

  if (tool_name && should_emit_use) {
    events.push({
      type: 'tool_use',
      toolName: tool_name,
      ...(tool_input ? { toolInput: tool_input } : {}),
    });
  }

  const should_emit_result =
    normalized_phase.includes('finish')
    || normalized_phase.includes('complete')
    || normalized_phase.includes('result')
    || result_fragments.length > 0;

  if (should_emit_result) {
    for (const text of result_fragments) {
      events.push({ type: 'tool_result', text });
    }
  }

  return events;
}

function extract_item_completed_events(
  item: Record<string, unknown>,
  state: CodexEventParseState
): { events: RuntimeEvent[]; assistant_fragments: string[] } {
  const events: RuntimeEvent[] = [];
  const assistant_fragments: string[] = [];

  const item_type = normalize_codex_event_type(
    get_string_field(item, ['type', 'item_type', 'kind']) ?? ''
  );

  if (item_type.includes('mcp.tool.call')) {
    const tool_name = get_string_field(item, ['name', 'tool_name', 'toolName']);
    const tool_input = get_record_field(item, ['input', 'arguments', 'args']);

    if (tool_name) {
      events.push({
        type: 'tool_use',
        toolName: tool_name,
        ...(tool_input ? { toolInput: tool_input } : {}),
      });
    }

    const result_fragments = unique_text([
      ...extract_text_fragments(item.result),
      ...extract_text_fragments(item.output),
      ...extract_text_fragments(item.content),
    ]);

    for (const text of result_fragments) {
      events.push({ type: 'tool_result', text });
    }

    return { events, assistant_fragments };
  }

  if (item_type.includes('agent.message') && !state.saw_assistant_delta) {
    const fragments = unique_text(extract_text_fragments(item));
    for (const text of fragments) {
      events.push({ type: 'text', text });
      assistant_fragments.push(text);
    }
  }

  return { events, assistant_fragments };
}

function map_turn_completed_event(event: Record<string, unknown>): RuntimeEvent {
  const duration_ms = get_number_by_paths(event, [
    ['duration_ms'],
    ['durationMs'],
    ['metrics', 'duration_ms'],
    ['metrics', 'durationMs'],
  ]);
  const cost_usd = get_number_by_paths(event, [
    ['cost_usd'],
    ['costUsd'],
    ['metrics', 'cost_usd'],
    ['metrics', 'costUsd'],
    ['usage', 'cost_usd'],
    ['usage', 'costUsd'],
    ['token_usage', 'cost_usd'],
    ['token_usage', 'costUsd'],
  ]);

  return {
    type: 'status',
    status: 'done',
    ...(
      duration_ms !== undefined || cost_usd !== undefined
        ? {
            metrics: {
              ...(duration_ms !== undefined ? { duration_ms } : {}),
              ...(cost_usd !== undefined ? { cost_usd } : {}),
            },
          }
        : {}
    ),
  };
}

export function map_codex_event_to_runtime_events(
  event: CodexJsonEvent,
  current_state: CodexEventParseState
): CodexEventParseResult {
  const normalized_type = normalize_codex_event_type(event.type);
  const next_state: CodexEventParseState = { ...current_state };
  const events: RuntimeEvent[] = [];
  let turn_completed = false;
  const assistant_fragments: string[] = [];

  if (normalized_type.includes('item.agent.message.delta')) {
    const fragments = unique_text([
      ...extract_text_fragments(event.delta),
      ...extract_text_fragments(event.text),
      ...extract_text_fragments(event.content),
    ]);

    for (const text of fragments) {
      events.push({ type: 'text', text });
      assistant_fragments.push(text);
    }

    if (fragments.length > 0) {
      next_state.saw_assistant_delta = true;
    }
  }

  if (normalized_type === 'item.completed') {
    const item = as_record(event.item);
    if (item) {
      const mapped = extract_item_completed_events(item, next_state);
      events.push(...mapped.events);
      assistant_fragments.push(...mapped.assistant_fragments);
    }
  }

  if (normalized_type.includes('item.mcp.tool.call.progress')) {
    const event_record = as_record(event);
    if (event_record) {
      events.push(...extract_tool_progress_events(event_record));
    }
  }

  if (normalized_type === 'turn.completed') {
    turn_completed = true;
    const event_record = as_record(event) ?? {};
    events.push(map_turn_completed_event(event_record));
  }

  if (normalized_type === 'turn.failed') {
    turn_completed = true;
    const event_record = as_record(event) ?? {};
    const error_text = extract_error_text(event_record);
    if (error_text) {
      events.push({ type: 'error', error: error_text });
    }
    events.push({ type: 'status', status: 'done' });
  }

  if (normalized_type === 'error') {
    const event_record = as_record(event) ?? {};
    const error_text = extract_error_text(event_record);
    if (error_text) {
      events.push({ type: 'error', error: error_text });
    }
  }

  return {
    events,
    next_state,
    turn_completed,
    assistant_fragments,
  };
}

function quote_toml_string(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function terminate_child(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.killed || child.exitCode !== null) {
      resolve();
      return;
    }

    const timeout = setTimeout(() => {
      if (!child.killed) {
        child.kill('SIGKILL');
      }
      resolve();
    }, 5000);

    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });

    child.kill('SIGTERM');
  });
}

export class CodexProcess extends EventEmitter implements RuntimeProcess {
  private readonly options: CodexProcessOptions;
  private readonly working_dir: string;
  private readonly system_prompt: string;
  private running = false;
  private stopping = false;
  private exit_emitted = false;
  private queue: string[] = [];
  private processing = false;
  private active_turn: ChildProcess | null = null;
  private active_turn_rl: readline.Interface | null = null;
  private turn_parse_state: CodexEventParseState = { saw_assistant_delta: false };
  private turn_completed = false;
  private turn_assistant_fragments: string[] = [];
  private history: ConversationEntry[] = [];

  constructor(options: CodexProcessOptions = {}) {
    super();
    this.options = options;
    this.working_dir = options.workingDir || process.cwd();
    this.system_prompt = load_system_prompt(this.working_dir);
  }

  async start(): Promise<void> {
    if (this.running) {
      throw new Error('Codex process already running');
    }

    await assert_codex_runtime_ready({
      working_dir: this.working_dir,
    });

    this.running = true;
    this.stopping = false;
    this.exit_emitted = false;

    setTimeout(() => {
      if (!this.running || this.stopping) return;
      this.options.onReady?.();
      this.emit('ready');
    }, 50);
  }

  send(text: string): void {
    if (!this.running) {
      throw new Error('Codex process not running');
    }

    const trimmed = text.trim();
    if (!trimmed) return;
    this.queue.push(trimmed);
    this.process_next();
  }

  isRunning(): boolean {
    return this.running && !this.stopping;
  }

  async stop(): Promise<void> {
    if (!this.running) return;

    this.stopping = true;
    this.running = false;
    this.queue = [];

    const active_turn = this.active_turn;
    if (active_turn) {
      await terminate_child(active_turn);
    }

    this.cleanup_turn();
    this.processing = false;
    this.emit_exit_once(0);
  }

  private emit_exit_once(code: number | null): void {
    if (this.exit_emitted) return;
    this.exit_emitted = true;
    this.options.onExit?.(code);
    this.emit('exit', code);
  }

  private emit_runtime_event(event: RuntimeEvent): void {
    this.options.onEvent?.(event);
    this.emit('event', event);
  }

  private build_exec_args(): string[] {
    const ws_url = this.options.wsUrl ?? DEFAULT_WS_URL;
    const model = this.options.model;
    const config = load_project_codex_config(this.working_dir);
    const config_overrides = build_codex_overrides(config, CODEX_NORMAL_PROFILE);
    const args = [
      'exec',
      '--json',
      '--profile',
      CODEX_NORMAL_PROFILE,
    ];

    if (model) {
      args.push('--model', model);
    }

    for (const override of config_overrides) {
      args.push('-c', override);
    }

    return [
      ...args,
      '-c',
      'features.runtime_metrics=false',
      '-c',
      `mcp_servers.strudel.env.WS_URL=${quote_toml_string(ws_url)}`,
      '-',
    ];
  }

  private build_prompt(user_text: string): string {
    const history_lines = this.history.slice(-HISTORY_LIMIT).map((entry) => {
      const speaker = entry.role === 'user' ? 'User' : 'Assistant';
      return `${speaker}: ${entry.text}`;
    });

    const history_section = history_lines.length > 0
      ? `\n\nConversation history:\n${history_lines.join('\n\n')}`
      : '';

    return `${this.system_prompt}${history_section}

Current user request:
${user_text}

If playback is requested, call execute_pattern(). If stop is requested, call stop_pattern().`;
  }

  private process_next(): void {
    if (this.processing || !this.running || this.stopping) return;

    const user_text = this.queue.shift();
    if (!user_text) return;

    this.processing = true;
    this.turn_parse_state = { saw_assistant_delta: false };
    this.turn_completed = false;
    this.turn_assistant_fragments = [];

    this.history.push({ role: 'user', text: user_text });
    if (this.history.length > HISTORY_LIMIT * 2) {
      this.history = this.history.slice(-(HISTORY_LIMIT * 2));
    }

    const child = spawn('codex', this.build_exec_args(), {
      cwd: this.working_dir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    });

    this.active_turn = child;
    this.active_turn_rl = readline.createInterface({
      input: child.stdout!,
      crlfDelay: Infinity,
    });

    this.active_turn_rl.on('line', (line) => {
      if (!line.trim()) return;

      try {
        const parsed_event = JSON.parse(line) as CodexJsonEvent;
        const mapped = map_codex_event_to_runtime_events(parsed_event, this.turn_parse_state);
        this.turn_parse_state = mapped.next_state;
        if (mapped.turn_completed) {
          this.turn_completed = true;
        }

        if (mapped.assistant_fragments.length > 0) {
          this.turn_assistant_fragments.push(...mapped.assistant_fragments);
        }

        for (const event of mapped.events) {
          this.emit_runtime_event(event);
        }
      } catch {
        // Codex emits some non-JSON stderr-style lines on stdout in certain failure states.
      }
    });

    child.stderr?.on('data', (data) => {
      const text = data.toString();
      if (!text.trim()) return;
      console.error('[Codex stderr]:', text.trim());
    });

    child.on('error', (error) => {
      if (this.stopping) return;
      this.options.onError?.(error);
      this.emit('error', error);
    });

    child.on('exit', (code, signal) => {
      this.finalize_turn(code, signal);
    });

    const prompt = this.build_prompt(user_text);
    child.stdin?.write(prompt);
    child.stdin?.write('\n');
    child.stdin?.end();
  }

  private finalize_turn(code: number | null, signal: NodeJS.Signals | null): void {
    const assistant_text = this.turn_assistant_fragments.join('').trim();
    if (assistant_text) {
      this.history.push({ role: 'assistant', text: assistant_text });
      if (this.history.length > HISTORY_LIMIT * 2) {
        this.history = this.history.slice(-(HISTORY_LIMIT * 2));
      }
    }

    if (!this.turn_completed && !this.stopping) {
      this.emit_runtime_event({ type: 'status', status: 'done' });
    }

    const exit_code = code ?? (signal ? 1 : 0);
    if (exit_code !== 0 && !this.stopping) {
      const signal_suffix = signal ? ` (signal=${signal})` : '';
      const error = new Error(`Codex turn failed with code ${exit_code}${signal_suffix}`);
      this.options.onError?.(error);
      this.emit('error', error);
    }

    this.cleanup_turn();
    this.processing = false;

    if (!this.stopping) {
      this.process_next();
    }
  }

  private cleanup_turn(): void {
    this.active_turn_rl?.close();
    this.active_turn_rl = null;
    this.active_turn = null;
    this.turn_parse_state = { saw_assistant_delta: false };
    this.turn_completed = false;
    this.turn_assistant_fragments = [];
  }
}
