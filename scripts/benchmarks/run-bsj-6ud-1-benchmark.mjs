#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import WebSocket from 'ws';

const DEFAULT_WS_URL = 'ws://localhost:3000/api/ai-ws';
const DEFAULT_TIMEOUT_MS = 120000;
const DEFAULT_JAM_START_RUNS = 8;
const DEFAULT_TARGETED_RUNS = 12;
const DEFAULT_BROADCAST_RUNS = 12;
const DEFAULT_DIRECTIVE_PRESET_ID = 'funk';

const THRESHOLDS = {
  jam_start_p95_ms: 20000,
  targeted_p95_ms: 8000,
  directive_success_rate_percent: 98,
};

const ACTIVE_AGENTS = ['drums', 'bass', 'melody', 'chords'];

function parse_int_arg(raw, fallback) {
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parse_args(argv) {
  const args = {
    ws_url: DEFAULT_WS_URL,
    timeout_ms: DEFAULT_TIMEOUT_MS,
    jam_start_runs: DEFAULT_JAM_START_RUNS,
    targeted_runs: DEFAULT_TARGETED_RUNS,
    broadcast_runs: DEFAULT_BROADCAST_RUNS,
    output_dir: '',
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--url' && next) {
      args.ws_url = next;
      i++;
    } else if (arg === '--timeout-ms' && next) {
      args.timeout_ms = parse_int_arg(next, DEFAULT_TIMEOUT_MS);
      i++;
    } else if (arg === '--jam-start-runs' && next) {
      args.jam_start_runs = parse_int_arg(next, DEFAULT_JAM_START_RUNS);
      i++;
    } else if (arg === '--targeted-runs' && next) {
      args.targeted_runs = parse_int_arg(next, DEFAULT_TARGETED_RUNS);
      i++;
    } else if (arg === '--broadcast-runs' && next) {
      args.broadcast_runs = parse_int_arg(next, DEFAULT_BROADCAST_RUNS);
      i++;
    } else if (arg === '--output-dir' && next) {
      args.output_dir = next;
      i++;
    }
  }

  return args;
}

function percentile(values, percentile_value) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil((percentile_value / 100) * sorted.length) - 1);
  return sorted[index];
}

function mean(values) {
  if (values.length === 0) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function latency_stats(results) {
  const latencies = results.filter((entry) => entry.success).map((entry) => entry.latency_ms);
  return {
    count: results.length,
    success_count: latencies.length,
    success_rate_percent: results.length === 0 ? null : (latencies.length / results.length) * 100,
    p50_ms: percentile(latencies, 50),
    p95_ms: percentile(latencies, 95),
    mean_ms: mean(latencies),
    min_ms: latencies.length ? Math.min(...latencies) : null,
    max_ms: latencies.length ? Math.max(...latencies) : null,
  };
}

function now_stamp() {
  const iso = new Date().toISOString();
  return iso.replace(/[-:]/g, '').replace(/\..+$/, '');
}

function create_output_dir(requested_dir) {
  if (requested_dir) {
    fs.mkdirSync(requested_dir, { recursive: true });
    return requested_dir;
  }
  const dir = path.join(process.cwd(), 'tmp', 'benchmarks', `bsj-6ud.1-${now_stamp()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function connect_websocket(ws_url, timeout_ms) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(ws_url);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`Timed out connecting to ${ws_url}`));
    }, timeout_ms);

    ws.once('open', () => {
      clearTimeout(timer);
      resolve(ws);
    });

    ws.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function wait_for_ready(ws, timeout_ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', on_message);
      reject(new Error('Timed out waiting for runtime ready status'));
    }, timeout_ms);

    const on_message = (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (message.type === 'error') {
        clearTimeout(timer);
        ws.off('message', on_message);
        reject(new Error(`Runtime startup error: ${message.error ?? 'unknown error'}`));
        return;
      }
      if (message.type === 'status' && message.status === 'ready') {
        clearTimeout(timer);
        ws.off('message', on_message);
        resolve();
      }
    };

    ws.on('message', on_message);
  });
}

function run_operation(ws, message, options) {
  const {
    label,
    timeout_ms,
    required_message_types = [],
  } = options;

  return new Promise((resolve, reject) => {
    const started_at = Date.now();
    const seen_types = new Set();
    let first_error_message = null;

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`${label} timed out after ${timeout_ms}ms`));
    }, timeout_ms);

    const on_message = (raw) => {
      let incoming;
      try {
        incoming = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (!incoming || typeof incoming.type !== 'string') return;

      seen_types.add(incoming.type);
      if (incoming.type === 'error' && !first_error_message) {
        first_error_message = incoming.error ?? 'Unknown server error';
      }

      if (incoming.type !== 'status' || incoming.status !== 'done') {
        return;
      }

      if (first_error_message) {
        cleanup();
        reject(new Error(`${label} failed: ${first_error_message}`));
        return;
      }

      const missing = required_message_types.filter((type) => !seen_types.has(type));
      if (missing.length > 0) {
        cleanup();
        reject(new Error(`${label} missing expected events: ${missing.join(', ')}`));
        return;
      }

      const latency_ms = Date.now() - started_at;
      cleanup();
      resolve({
        latency_ms,
        seen_message_types: [...seen_types],
      });
    };

    const cleanup = () => {
      clearTimeout(timer);
      ws.off('message', on_message);
    };

    ws.on('message', on_message);
    ws.send(JSON.stringify(message));
  });
}

async function stop_jam_best_effort(ws, timeout_ms) {
  try {
    await run_operation(ws, { type: 'stop_jam' }, {
      label: 'stop_jam',
      timeout_ms,
      required_message_types: [],
    });
  } catch {
    // Best effort cleanup only.
  }
}

async function measure_jam_start_series(ws, run_count, timeout_ms) {
  const results = [];
  for (let run = 1; run <= run_count; run++) {
    const label = `jam_start#${run}`;
    const started_at = new Date().toISOString();
    try {
      const measurement = await run_operation(ws, {
        type: 'start_jam',
        activeAgents: ACTIVE_AGENTS,
      }, {
        label,
        timeout_ms,
        required_message_types: ['jam_state_update'],
      });

      results.push({
        run,
        started_at,
        success: true,
        latency_ms: measurement.latency_ms,
      });
    } catch (err) {
      results.push({
        run,
        started_at,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      await stop_jam_best_effort(ws, timeout_ms);
    }
  }
  return results;
}

async function ensure_jam_started_for_directives(ws, timeout_ms) {
  await run_operation(ws, {
    type: 'start_jam',
    activeAgents: ACTIVE_AGENTS,
  }, {
    label: 'directive_warm_start_jam',
    timeout_ms,
    required_message_types: ['jam_state_update'],
  });

  await run_operation(ws, {
    type: 'set_jam_preset',
    presetId: DEFAULT_DIRECTIVE_PRESET_ID,
  }, {
    label: `directive_warm_set_preset(${DEFAULT_DIRECTIVE_PRESET_ID})`,
    timeout_ms,
    required_message_types: ['jam_state_update'],
  });

  // Seed at least one active agent so subsequent broadcast directives hit the
  // normal "active agents" path in staged-silent jams.
  await run_operation(ws, {
    type: 'boss_directive',
    text: '@CHORDS join with clear comping stabs for benchmark warmup',
    targetAgent: 'chords',
    activeAgents: ACTIVE_AGENTS,
  }, {
    label: 'directive_warm_activate_chords',
    timeout_ms,
    required_message_types: ['jam_state_update', 'execute'],
  });
}

async function measure_directive_series(ws, run_count, timeout_ms, mode) {
  const results = [];
  for (let run = 1; run <= run_count; run++) {
    const label = `${mode}_directive#${run}`;
    const started_at = new Date().toISOString();
    const message = mode === 'targeted'
      ? {
        type: 'boss_directive',
        text: `@BEAT tighten syncopation pocket (run ${run})`,
        targetAgent: 'drums',
        activeAgents: ACTIVE_AGENTS,
      }
      : {
        type: 'boss_directive',
        text: `Band: raise intensity and keep groove coherent (run ${run})`,
        activeAgents: ACTIVE_AGENTS,
      };

    try {
      const measurement = await run_operation(ws, message, {
        label,
        timeout_ms,
        required_message_types: ['jam_state_update', 'execute'],
      });
      results.push({
        run,
        started_at,
        success: true,
        latency_ms: measurement.latency_ms,
      });
    } catch (err) {
      results.push({
        run,
        started_at,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return results;
}

function build_summary_markdown(payload) {
  const started_at = payload.started_at;
  const completed_at = payload.completed_at;
  const config = payload.config;
  const stats = payload.stats;
  const gates = payload.gates;

  return [
    '# Workstream G Benchmark Summary',
    '',
    `- Started: ${started_at}`,
    `- Completed: ${completed_at}`,
    `- WebSocket URL: ${config.ws_url}`,
    `- Jam start runs: ${config.jam_start_runs}`,
    `- Targeted directive runs: ${config.targeted_runs}`,
    `- Broadcast directive runs: ${config.broadcast_runs}`,
    '',
    '## Metrics',
    '',
    '| Scenario | Success rate | p50 (ms) | p95 (ms) | Mean (ms) |',
    '|---|---:|---:|---:|---:|',
    `| Jam start (4 agents) | ${stats.jam_start.success_rate_percent?.toFixed(2) ?? 'n/a'}% | ${stats.jam_start.p50_ms ?? 'n/a'} | ${stats.jam_start.p95_ms ?? 'n/a'} | ${stats.jam_start.mean_ms?.toFixed(1) ?? 'n/a'} |`,
    `| Targeted directive (@BEAT) | ${stats.targeted.success_rate_percent?.toFixed(2) ?? 'n/a'}% | ${stats.targeted.p50_ms ?? 'n/a'} | ${stats.targeted.p95_ms ?? 'n/a'} | ${stats.targeted.mean_ms?.toFixed(1) ?? 'n/a'} |`,
    `| Broadcast directive (all agents) | ${stats.broadcast.success_rate_percent?.toFixed(2) ?? 'n/a'}% | ${stats.broadcast.p50_ms ?? 'n/a'} | ${stats.broadcast.p95_ms ?? 'n/a'} | ${stats.broadcast.mean_ms?.toFixed(1) ?? 'n/a'} |`,
    '',
    `- Combined directive success rate: ${stats.directive_success_rate_percent.toFixed(2)}%`,
    '',
    '## Gate Evaluation',
    '',
    `- Jam start p95 <= ${THRESHOLDS.jam_start_p95_ms}ms: ${gates.jam_start_p95_pass ? 'PASS' : 'FAIL'}`,
    `- Targeted directive p95 <= ${THRESHOLDS.targeted_p95_ms}ms: ${gates.targeted_p95_pass ? 'PASS' : 'FAIL'}`,
    `- Directive success rate >= ${THRESHOLDS.directive_success_rate_percent}%: ${gates.directive_success_rate_pass ? 'PASS' : 'FAIL'}`,
    `- Overall gate: ${gates.overall_pass ? 'PASS' : 'FAIL'}`,
    '',
  ].join('\n');
}

async function main() {
  const args = parse_args(process.argv.slice(2));
  const output_dir = create_output_dir(args.output_dir);
  const started_at = new Date().toISOString();

  console.log('[bench] connecting to runtime websocket...');
  const ws = await connect_websocket(args.ws_url, args.timeout_ms);
  ws.on('error', (err) => {
    console.error('[bench] websocket error:', err);
  });

  try {
    console.log('[bench] waiting for ready status...');
    await wait_for_ready(ws, args.timeout_ms);
    console.log('[bench] runtime ready');

    console.log('[bench] warmup run (jam start + stop)');
    await run_operation(ws, { type: 'start_jam', activeAgents: ACTIVE_AGENTS }, {
      label: 'warmup_jam_start',
      timeout_ms: args.timeout_ms,
      required_message_types: ['jam_state_update'],
    });
    await stop_jam_best_effort(ws, args.timeout_ms);

    console.log(`[bench] measuring jam start (${args.jam_start_runs} runs)`);
    const jam_start_runs = await measure_jam_start_series(ws, args.jam_start_runs, args.timeout_ms);

    console.log('[bench] starting jam for directive tests');
    await ensure_jam_started_for_directives(ws, args.timeout_ms);

    console.log(`[bench] measuring targeted directives (${args.targeted_runs} runs)`);
    const targeted_runs = await measure_directive_series(ws, args.targeted_runs, args.timeout_ms, 'targeted');

    console.log(`[bench] measuring broadcast directives (${args.broadcast_runs} runs)`);
    const broadcast_runs = await measure_directive_series(ws, args.broadcast_runs, args.timeout_ms, 'broadcast');

    await stop_jam_best_effort(ws, args.timeout_ms);

    const jam_start_stats = latency_stats(jam_start_runs);
    const targeted_stats = latency_stats(targeted_runs);
    const broadcast_stats = latency_stats(broadcast_runs);

    const total_directive_runs = targeted_runs.length + broadcast_runs.length;
    const total_directive_success = targeted_runs.filter((run) => run.success).length
      + broadcast_runs.filter((run) => run.success).length;
    const directive_success_rate_percent = total_directive_runs === 0
      ? 0
      : (total_directive_success / total_directive_runs) * 100;

    const gates = {
      jam_start_p95_pass:
        jam_start_stats.p95_ms !== null
        && jam_start_stats.p95_ms <= THRESHOLDS.jam_start_p95_ms,
      targeted_p95_pass:
        targeted_stats.p95_ms !== null
        && targeted_stats.p95_ms <= THRESHOLDS.targeted_p95_ms,
      directive_success_rate_pass:
        directive_success_rate_percent >= THRESHOLDS.directive_success_rate_percent,
    };
    gates.overall_pass = gates.jam_start_p95_pass && gates.targeted_p95_pass && gates.directive_success_rate_pass;

    const completed_at = new Date().toISOString();
    const payload = {
      benchmark_id: `bsj-6ud.1-${now_stamp()}`,
      started_at,
      completed_at,
      config: {
        ws_url: args.ws_url,
        timeout_ms: args.timeout_ms,
        jam_start_runs: args.jam_start_runs,
        targeted_runs: args.targeted_runs,
        broadcast_runs: args.broadcast_runs,
      },
      thresholds: THRESHOLDS,
      runs: {
        jam_start: jam_start_runs,
        targeted: targeted_runs,
        broadcast: broadcast_runs,
      },
      stats: {
        jam_start: jam_start_stats,
        targeted: targeted_stats,
        broadcast: broadcast_stats,
        directive_success_rate_percent,
      },
      gates,
    };

    const results_path = path.join(output_dir, 'results.json');
    const summary_path = path.join(output_dir, 'summary.md');
    fs.writeFileSync(results_path, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
    fs.writeFileSync(summary_path, `${build_summary_markdown(payload)}\n`, 'utf-8');

    console.log(`[bench] wrote ${results_path}`);
    console.log(`[bench] wrote ${summary_path}`);
    console.log(
      `[bench] gate result: ${gates.overall_pass ? 'PASS' : 'FAIL'} ` +
      `(jam_p95=${jam_start_stats.p95_ms}ms, targeted_p95=${targeted_stats.p95_ms}ms, ` +
      `directive_success=${directive_success_rate_percent.toFixed(2)}%)`
    );
  } finally {
    ws.close();
  }
}

main().catch((err) => {
  console.error('[bench] failed:', err);
  process.exit(1);
});
