import { spawn } from 'child_process';
import { randomUUID } from 'node:crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  assert_codex_runtime_ready,
  build_codex_overrides,
  CODEX_JAM_PROFILE,
  load_project_codex_config,
} from './codex-runtime-checks';
import {
  type CameraDirectivePayload,
  type ConductorInterpreterDiagnostics,
  type ConductorInterpreterResult,
  type InterpretedVisionDirective,
  type JamAgentKey,
  AGENT_META,
} from './types';

const VISION_INTERPRETER_SYSTEM_PROMPT =
  'You are a jam conductor vision interpreter for buttery_smooth_jamming.';

const VISION_INTERPRETER_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://buttery-smooth-jamming.local/camera-directive.schema.json',
  type: 'object',
  additionalProperties: false,
  required: ['directive', 'confidence'],
  properties: {
    directive: {
      type: 'string',
      minLength: 1,
      maxLength: 500,
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
    },
    target_agent: {
      type: 'string',
      enum: ['drums', 'bass', 'melody', 'chords'],
    },
    rationale: {
      type: 'string',
      maxLength: 500,
    },
    reason: {
      type: 'string',
      maxLength: 200,
    },
  },
} as const;

const COMMAND_TIMEOUT_MS = 15_000;
const AGENT_TARGET_SET = new Set<JamAgentKey>(['drums', 'bass', 'melody', 'chords']);
const MIN_SAMPLE_INTERVAL_MS = 1;
const MAX_SAMPLE_INTERVAL_MS = 10_000;
const MAX_FRAME_DIMENSION = 8_000;
const CAMERA_INTERPRETATION_MIN_CONFIDENCE = 0.78;
const CAMERA_STALE_SAMPLE_MESSAGE = 'Vision sample is stale (extended capture gap).';

interface CodexCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  exitSignal: string | null;
  timedOut: boolean;
}

interface ParsedNumberOptions {
  min?: number;
  max?: number;
}

interface CameraSampleFreshnessOptions {
  maxAgeMs: number;
  maxFutureSkewMs: number;
  nowMs?: number;
}

function build_conductor_interpreter_failure(
  reason: string,
  confidence: number,
  parse_error?: string,
  diagnostics?: ConductorInterpreterDiagnostics
): ConductorInterpreterResult {
  return {
    accepted: false,
    reason,
    confidence,
    explicit_target: null,
    rejected_reason: parse_error ? `Model output parse/validation failed: ${parse_error}` : reason,
    ...(diagnostics ? { diagnostics } : {}),
  };
}

function infer_rejection_reason(
  diagnostics: ConductorInterpreterDiagnostics,
  interpretation: InterpretedVisionDirective | null
): ConductorInterpreterResult['reason'] {
  if (interpretation && interpretation.confidence < CAMERA_INTERPRETATION_MIN_CONFIDENCE) {
    return 'below_confidence_threshold';
  }

  const parseError = (diagnostics.parse_error ?? '').toLowerCase();
  if (parseError.includes('stale')) {
    return 'stale_sample';
  }
  if (parseError.includes('exit') || parseError.includes('command') || parseError.includes('terminated')) {
    return 'model_execution_failure';
  }
  if (parseError.includes('timeout') || parseError.includes('timed out')) {
    return 'model_execution_failure';
  }

  if (parseError.includes('below minimum') || parseError.includes('confidence threshold')) {
    return 'below_confidence_threshold';
  }

  if (parseError || interpretation !== null) {
    return 'model_parse_failure';
  }

  return 'model_parse_failure';
}

function is_jam_agent_key(value: unknown): value is JamAgentKey {
  return typeof value === 'string' && AGENT_TARGET_SET.has(value as JamAgentKey);
}

function parse_number(value: unknown, options: ParsedNumberOptions = {}): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;

  const min = options.min ?? -Infinity;
  const max = options.max ?? Infinity;
  if (value < min || value > max) return null;
  return value;
}

function is_confidence(value: unknown): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  return value >= 0 && value <= 1;
}

function normalize_interpreted_directive(value: unknown): InterpretedVisionDirective | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const directive = typeof record.directive === 'string'
    ? record.directive.trim()
    : '';

  const confidenceRaw = record.confidence;
  const confidence = is_confidence(confidenceRaw) ? confidenceRaw : null;

  if (!directive || confidence === null) {
    return null;
  }

  const targetRaw = typeof record.target_agent === 'string'
    ? record.target_agent
    : typeof record.targetAgent === 'string'
      ? record.targetAgent
      : undefined;
  const normalizedTarget = typeof targetRaw === 'string' ? targetRaw.toLowerCase() : '';
  const target = is_jam_agent_key(normalizedTarget) ? normalizedTarget : undefined;

  const rationale = typeof record.rationale === 'string'
    ? record.rationale.trim()
    : undefined;

  return {
    directive: directive.slice(0, 500),
    confidence,
    ...(target ? { targetAgent: target } : {}),
    ...(rationale ? { rationale } : {}),
  };
}

function parse_single_json_object(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const startsWithObject = trimmed.startsWith('{');
  const endsWithObject = trimmed.endsWith('}');
  if (!startsWithObject || !endsWithObject) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

export function apply_camera_sample_freshness(
  payload: CameraDirectivePayload,
  options: CameraSampleFreshnessOptions
): CameraDirectivePayload {
  if (payload.sample.isStale === true) return payload;

  const nowMs = Number.isFinite(options.nowMs) ? Number(options.nowMs) : Date.now();
  const ageMs = nowMs - payload.sample.capturedAtMs;
  const futureSkewMs = payload.sample.capturedAtMs - nowMs;
  const isStale = ageMs > options.maxAgeMs || futureSkewMs > options.maxFutureSkewMs;
  if (!isStale) return payload;

  return {
    sample: {
      ...payload.sample,
      isStale: true,
    },
  };
}

export function normalize_camera_directive_payload(value: unknown): CameraDirectivePayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const root = value as Record<string, unknown>;
  if (typeof root.sample !== 'object' || root.sample === null || Array.isArray(root.sample)) return null;
  const sample = root.sample as Record<string, unknown>;

  const capturedAtMs = parse_number(sample.capturedAtMs, { min: 1 });
  const frameWidth = parse_number(sample.frameWidth, { min: 1, max: MAX_FRAME_DIMENSION });
  const frameHeight = parse_number(sample.frameHeight, { min: 1, max: MAX_FRAME_DIMENSION });
  const sampleIntervalMs = parse_number(sample.sampleIntervalMs, {
    min: MIN_SAMPLE_INTERVAL_MS,
    max: MAX_SAMPLE_INTERVAL_MS,
  });
  const sampleIsStaleRaw = sample.isStale;
  if (sampleIsStaleRaw !== undefined && typeof sampleIsStaleRaw !== 'boolean') return null;
  const isStale = sampleIsStaleRaw === true;
  if (capturedAtMs === null || frameWidth === null || frameHeight === null || sampleIntervalMs === null) {
    return null;
  }

  const motion = sample.motion;
  if (!motion || typeof motion !== 'object' || Array.isArray(motion)) return null;
  const motionRecord = motion as Record<string, unknown>;

  const score = parse_number(motionRecord.score, { min: 0, max: 1 });
  const left = parse_number(motionRecord.left, { min: 0, max: 1 });
  const right = parse_number(motionRecord.right, { min: 0, max: 1 });
  const top = parse_number(motionRecord.top, { min: 0, max: 1 });
  const bottom = parse_number(motionRecord.bottom, { min: 0, max: 1 });
  const centroidX = parse_number(motionRecord.centroidX, { min: 0, max: 1 });
  const centroidY = parse_number(motionRecord.centroidY, { min: 0, max: 1 });
  const maxDelta = parse_number(motionRecord.maxDelta, { min: 0, max: 1 });
  if (
    score === null
    || left === null
    || right === null
    || top === null
    || bottom === null
    || centroidX === null
    || centroidY === null
    || maxDelta === null
  ) {
    return null;
  }

  const face = sample.face;
  const normalizedFace = (() => {
    if (face === undefined) return undefined;
    if (!face || typeof face !== 'object' || Array.isArray(face)) return null;
    const faceRecord = face as Record<string, unknown>;

    const present = typeof faceRecord.present === 'boolean' ? faceRecord.present : null;
    const faceMotion = parse_number(faceRecord.motion, { min: 0, max: 1 });
    const areaRatio = parse_number(faceRecord.areaRatio, { min: 0, max: 1 });
    const stability = parse_number(faceRecord.stability, { min: 0, max: 1 });
    if (present === null || faceMotion === null || areaRatio === null || stability === null) return null;

    const rawBox = faceRecord.box;
    const box = (() => {
      if (rawBox === undefined) return undefined;
      if (!rawBox || typeof rawBox !== 'object' || Array.isArray(rawBox)) return null;
      const rawBoxRecord = rawBox as Record<string, unknown>;
      const x = parse_number(rawBoxRecord.x, { min: 0, max: 1 });
      const y = parse_number(rawBoxRecord.y, { min: 0, max: 1 });
      const width = parse_number(rawBoxRecord.width, { min: 0, max: 1 });
      const height = parse_number(rawBoxRecord.height, { min: 0, max: 1 });
      if (x === null || y === null || width === null || height === null) return null;
      return { x, y, width, height };
    })();

    if (box === null) return null;

    return {
      present,
      motion: faceMotion,
      areaRatio,
      stability,
      ...(box ? { box } : {}),
    };
  })();
  if (normalizedFace === null) return null;

  return {
    sample: {
      capturedAtMs,
      sampleIntervalMs,
      frameWidth,
      frameHeight,
      motion: {
        score,
        left,
        right,
        top,
        bottom,
        centroidX,
        centroidY,
        maxDelta,
      },
      ...(sampleIsStaleRaw !== undefined ? { isStale } : {}),
      ...(normalizedFace ? { face: normalizedFace } : {}),
    },
  };
}

function build_interpreter_prompt(sample: CameraDirectivePayload): string {
  const agentLines = Object.entries(AGENT_META)
    .map(([agentKey, meta]) => {
      const roleLine = (() => {
        switch (agentKey) {
          case 'drums':
            return 'rhythm and groove driver';
          case 'bass':
            return 'low-end movement and pocket';
          case 'melody':
            return 'top-line phrasing and motifs';
          case 'chords':
            return 'harmonic movement and comping texture';
          default:
            return 'instrumental part';
        }
      })();

      return `- ${meta.name} (${agentKey}) handles ${roleLine}`;
    });

  return [
    `${VISION_INTERPRETER_SYSTEM_PROMPT} Translate camera motion into concise boss directives.`,
    '',
    'Available subagents:',
    ...agentLines,
    '',
    'Use a target only when movement/expressive evidence is clearly lane-specific.',
    'Default behavior is broadcast to all ("all" agents) when unclear.',
    'If sample.isStale is true, treat this as background/noise and avoid high-confidence decisions.',
    '',
    'Interpretation rules:',
    '- Ignore tiny jitter; look for meaningful movement patterns.',
    '- If you detect a likely emotion/facial reaction, turn it into a musical direction phrase.',
    '- Return only strict JSON matching this schema and nothing else.',
    '',
    'Confidence output:',
    '- confidence must be numeric in [0, 1].',
    '- 0.0 means "no clear signal", 1.0 means "very clear signal".',
    '',
    'Output format example:',
    '{ "directive": "tighten groove and add syncopation", "confidence": 0.83, "target_agent": "drums", "rationale": "right hand motion and fast steps" }',
    '',
    'Camera sample payload:',
    JSON.stringify(sample, null, 2),
  ].join('\n');
}

function create_codex_command_args(schemaPath: string, prompt: string): string[] {
  return [
    'exec',
    '-p',
    CODEX_JAM_PROFILE,
    '--json',
    '--skip-git-repo-check',
    '--output-schema',
    schemaPath,
    prompt,
  ];
}

function apply_config_overrides(args: string[], overrides: string[]): string[] {
  if (overrides.length === 0) return [...args];
  const flattened: string[] = [];
  for (const override of overrides) {
    flattened.push('-c', override);
  }
  return [...flattened, ...args];
}

function run_codex_command(
  args: string[],
  workingDir: string,
  overrides: string[]
): Promise<CodexCommandResult> {
  return new Promise((resolve, reject) => {
    let timedOut = false;
    const command = spawn('codex', apply_config_overrides(args, overrides), {
      cwd: workingDir,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const finish = (exitCode: number | null, exitSignal: string | null) => {
      if (settled) return;
      settled = true;
      resolve({
        stdout,
        stderr,
        exitCode,
        exitSignal: exitSignal ?? (timedOut ? 'SIGKILL' : null),
        timedOut,
      });
    };

    const clearTimeoutSafely = () => {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
    };

    command.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    command.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    command.on('error', (error) => {
      clearTimeoutSafely();
      reject(error);
    });

    command.on('close', (code, signal) => {
      clearTimeoutSafely();
      finish(code, signal);
    });

    timeout = setTimeout(() => {
      if (command.killed) return;
      command.kill('SIGKILL');
      timedOut = true;
      finish(1, 'SIGKILL');
    }, COMMAND_TIMEOUT_MS);
  });
}

function sanitize_sample(sample: CameraDirectivePayload): CameraDirectivePayload {
  return {
    sample: {
      capturedAtMs: Number.isFinite(sample.sample.capturedAtMs) ? sample.sample.capturedAtMs : Date.now(),
      sampleIntervalMs: sample.sample.sampleIntervalMs,
      frameWidth: Math.max(1, Math.trunc(sample.sample.frameWidth)),
      frameHeight: Math.max(1, Math.trunc(sample.sample.frameHeight)),
      motion: {
        score: Math.min(1, Math.max(0, sample.sample.motion.score)),
        left: Math.min(1, Math.max(0, sample.sample.motion.left)),
        right: Math.min(1, Math.max(0, sample.sample.motion.right)),
        top: Math.min(1, Math.max(0, sample.sample.motion.top)),
        bottom: Math.min(1, Math.max(0, sample.sample.motion.bottom)),
        centroidX: Math.min(1, Math.max(0, sample.sample.motion.centroidX)),
        centroidY: Math.min(1, Math.max(0, sample.sample.motion.centroidY)),
        maxDelta: Math.min(1, Math.max(0, sample.sample.motion.maxDelta)),
      },
      ...(sample.sample.face ? {
        face: {
          present: Boolean(sample.sample.face.present),
          motion: Math.min(1, Math.max(0, sample.sample.face.motion)),
          areaRatio: Math.min(1, Math.max(0, sample.sample.face.areaRatio)),
          stability: Math.min(1, Math.max(0, sample.sample.face.stability)),
          ...(sample.sample.face.box ? {
            box: {
              x: Math.min(1, Math.max(0, sample.sample.face.box.x)),
              y: Math.min(1, Math.max(0, sample.sample.face.box.y)),
              width: Math.min(1, Math.max(0, sample.sample.face.box.width)),
              height: Math.min(1, Math.max(0, sample.sample.face.box.height)),
            },
          } : {}),
        },
      } : {}),
      ...(sample.sample.isStale === undefined ? {} : { isStale: sample.sample.isStale }),
    },
  };
}

export interface CameraDirectiveInterpretationResult {
  interpretation: InterpretedVisionDirective | null;
  diagnostics: ConductorInterpreterDiagnostics;
}

export async function interpretCameraDirective(
  workingDir: string,
  payload: CameraDirectivePayload
): Promise<CameraDirectiveInterpretationResult> {
  await assert_codex_runtime_ready({
    working_dir: workingDir,
    required_profiles: [CODEX_JAM_PROFILE],
  });

  const config = load_project_codex_config(workingDir);
  const configOverrides = build_codex_overrides(config, CODEX_JAM_PROFILE);
  const safePayload = sanitize_sample(payload);

  if (safePayload.sample.isStale === true) {
    return {
      interpretation: null,
      diagnostics: {
        model_exit_code: null,
        model_exit_signal: null,
        model_timed_out: false,
        parse_error: CAMERA_STALE_SAMPLE_MESSAGE,
        raw_sample_timestamp_ms: payload.sample.capturedAtMs,
        payload_sample_interval_ms: payload.sample.sampleIntervalMs,
      },
    };
  }

  const prompt = build_interpreter_prompt(safePayload);
  const schemaPath = path.join(
    os.tmpdir(),
    `camera-directive-schema-${process.pid}-${randomUUID()}.json`
  );

  fs.writeFileSync(schemaPath, JSON.stringify(VISION_INTERPRETER_SCHEMA, null, 2), 'utf-8');
  const diagnostics: ConductorInterpreterDiagnostics = {
    model_exit_code: null,
    model_exit_signal: null,
    model_timed_out: false,
    raw_sample_timestamp_ms: payload.sample.capturedAtMs,
    payload_sample_interval_ms: payload.sample.sampleIntervalMs,
  };

  try {
    const output = await run_codex_command(
      create_codex_command_args(schemaPath, prompt),
      workingDir,
      configOverrides
    );
    diagnostics.model_exit_code = output.exitCode;
    diagnostics.model_exit_signal = output.exitSignal;
    diagnostics.model_timed_out = output.timedOut;

    if (output.timedOut) {
      diagnostics.parse_error = 'Model execution timed out.';
      return {
        interpretation: null,
        diagnostics,
      };
    }

    if (!output.stdout.trim()) {
      return {
        interpretation: null,
        diagnostics: {
          ...diagnostics,
          parse_error: 'Model returned empty stdout.',
        },
      };
    }

    if (output.exitCode !== 0) {
      return {
        interpretation: null,
        diagnostics: {
          ...diagnostics,
          parse_error: `Model exited with code ${output.exitCode}.`,
        },
      };
    }

    const parsed = parse_single_json_object(output.stdout);
    if (!parsed) {
      return {
        interpretation: null,
        diagnostics: {
          ...diagnostics,
          parse_error: 'Model output was not strict JSON.',
        },
      };
    }

    const interpretation = normalize_interpreted_directive(parsed);
    if (!interpretation) {
      return {
        interpretation: null,
        diagnostics: {
          ...diagnostics,
          parse_error: 'Model output shape is invalid.',
        },
      };
    }

    if (interpretation.confidence < CAMERA_INTERPRETATION_MIN_CONFIDENCE) {
      return {
        interpretation,
        diagnostics: {
          ...diagnostics,
          parse_error: 'Interpretation confidence below minimum model threshold.',
        },
      };
    }

    return {
      interpretation,
      diagnostics,
    };
  } finally {
    try {
      fs.unlinkSync(schemaPath);
    } catch {
      // Ignore cleanup errors.
    }
  }
}

export function build_conductor_interpretation_result(
  interpretation: InterpretedVisionDirective | null,
  source: string,
  diagnostics: ConductorInterpreterDiagnostics
): ConductorInterpreterResult {
  if (!interpretation || !interpretation.directive.trim()) {
    return build_conductor_interpreter_failure(
      infer_rejection_reason(diagnostics, interpretation),
      0,
      diagnostics.parse_error || 'No valid interpretation',
      diagnostics
    );
  }

  if (interpretation.confidence < CAMERA_INTERPRETATION_MIN_CONFIDENCE) {
    return {
      accepted: false,
      confidence: interpretation.confidence,
      reason: 'below_confidence_threshold',
      explicit_target: interpretation.targetAgent ?? null,
      interpretation: {
        directive: interpretation.directive,
        ...(interpretation.rationale ? { rationale: interpretation.rationale } : {}),
        ...(interpretation.targetAgent ? { target_agent: interpretation.targetAgent } : {}),
      },
      rejected_reason: `Model confidence (${interpretation.confidence.toFixed(2)}) below threshold.`,
      diagnostics,
    };
  }

  return {
    accepted: true,
    confidence: interpretation.confidence,
    reason: source,
    explicit_target: interpretation.targetAgent ?? null,
    interpretation: {
      directive: interpretation.directive,
      ...(interpretation.rationale ? { rationale: interpretation.rationale } : {}),
      ...(interpretation.targetAgent ? { target_agent: interpretation.targetAgent } : {}),
    },
    diagnostics,
  };
}
