import { NextRequest, NextResponse } from 'next/server';

import {
  apply_camera_sample_freshness,
  build_conductor_interpretation_result,
  interpretCameraDirective,
  normalize_camera_directive_payload,
  type CameraDirectiveInterpretationResult,
} from '@/lib/camera-directive-interpreter';
import type { ConductorInterpreterResult } from '@/lib/types';

const CONDUCTOR_INTENT_TOKEN = (process.env.CONDUCTOR_INTENT_TOKEN ?? '').trim();
const ALLOW_ALL_CONDUCTOR_HOSTS = (process.env.CONDUCTOR_INTENT_ALLOWED_HOSTS ?? '').split(',')
  .map((host) => host.trim().toLowerCase())
  .includes('*');
const CAMERA_SAMPLE_MAX_AGE_MS = getPositiveInt(process.env.CAMERA_SAMPLE_MAX_AGE_MS, 5_000);
const CAMERA_SAMPLE_MAX_FUTURE_SKEW_MS = getPositiveInt(process.env.CAMERA_SAMPLE_MAX_FUTURE_SKEW_MS, 1_500);
const ALLOWED_CONDUCTOR_HOSTS = new Set(
  (process.env.CONDUCTOR_INTENT_ALLOWED_HOSTS ?? 'localhost,127.0.0.1')
    .split(',')
    .map((host) => normalizeHost(host))
    .filter((host): host is string => Boolean(host))
);

function getPositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeHost(hostHeader: string | null | undefined): string | null {
  if (!hostHeader) return null;

  if (hostHeader.includes('://')) {
    try {
      return new URL(hostHeader).hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  const first = hostHeader.split(',')[0]?.trim() ?? '';
  if (!first) return null;
  if (first.startsWith('[')) {
    const closingIndex = first.indexOf(']');
    if (closingIndex > 0) {
      return first.substring(1, closingIndex).toLowerCase();
    }
  }

  return first.split(':')[0]?.trim().toLowerCase() ?? null;
}

function requestIsAllowed(request: NextRequest): boolean {
  const headerToken = (request.headers.get('x-conductor-intent-token') ?? '').trim();
  const forwardedHost = request.headers.get('x-forwarded-host');
  const host = request.headers.get('host');
  const requestHost = normalizeHost(forwardedHost || host);
  const originHost = normalizeHost(request.headers.get('origin'));
  const requestUrlHost = request.nextUrl?.hostname?.toLowerCase() ?? null;
  const clientHost = requestHost || originHost || requestUrlHost;
  const canonicalHost = request.nextUrl?.hostname.toLowerCase() ?? null;
  const isHostAllowed = !clientHost
    ? false
    : clientHost === canonicalHost || ALLOW_ALL_CONDUCTOR_HOSTS || ALLOWED_CONDUCTOR_HOSTS.has(clientHost);

  if (!CONDUCTOR_INTENT_TOKEN) return false;
  if (!headerToken || headerToken !== CONDUCTOR_INTENT_TOKEN) return false;
  if (!isHostAllowed) return false;

  return true;
}

const DEFAULT_ERROR_CONFIDENCE = 0;

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!requestIsAllowed(request)) {
    return NextResponse.json(
      {
        accepted: false,
        confidence: DEFAULT_ERROR_CONFIDENCE,
        reason: 'invalid_request',
        explicit_target: null,
        rejected_reason: 'Unauthorized conductor intent request.',
      } satisfies ConductorInterpreterResult,
      { status: 401 }
    );
  }

  const rawPayload = await request.json().catch(() => null);
  const payload = normalize_camera_directive_payload(rawPayload);
  if (!payload) {
    return NextResponse.json(
      {
        accepted: false,
        confidence: DEFAULT_ERROR_CONFIDENCE,
        reason: 'invalid_payload',
        explicit_target: null,
        rejected_reason: 'Invalid or missing camera vision payload.',
      } satisfies ConductorInterpreterResult,
      { status: 400 }
    );
  }
  const freshnessCheckedPayload = apply_camera_sample_freshness(payload, {
    maxAgeMs: CAMERA_SAMPLE_MAX_AGE_MS,
    maxFutureSkewMs: CAMERA_SAMPLE_MAX_FUTURE_SKEW_MS,
  });

  const workingDir = process.cwd();
  const interpretation: CameraDirectiveInterpretationResult = await interpretCameraDirective(
    workingDir,
    freshnessCheckedPayload
  )
    .catch((error) => ({
      interpretation: null,
      diagnostics: {
        model_exit_code: null,
        parse_error: error instanceof Error ? error.message : 'Interpreter execution failed.',
      },
    }));

  const result = build_conductor_interpretation_result(
    interpretation.interpretation,
    'interpreted',
    interpretation.diagnostics
  );

  if (!result.accepted) {
    return NextResponse.json(result);
  }

  if (!result.interpretation?.directive) {
    return NextResponse.json({
      accepted: false,
      confidence: DEFAULT_ERROR_CONFIDENCE,
      reason: 'model_parse_failure',
      explicit_target: null,
      rejected_reason: 'Model did not return a usable directive.',
      ...(interpretation.diagnostics ? { diagnostics: interpretation.diagnostics } : {}),
    } satisfies ConductorInterpreterResult);
  }

  return NextResponse.json(result);
}

export function GET(): NextResponse {
  return NextResponse.json({
    message: 'Conductor intent endpoint. POST with camera directive sample payload.',
  });
}
