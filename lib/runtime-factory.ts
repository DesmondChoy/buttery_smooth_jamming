import { CodexProcess } from './codex-process';
import type { RuntimeProcess, RuntimeProcessOptions } from './runtime-process';

export type RuntimeProvider = 'codex';
export type RuntimeRolloutStage = 'pre_gate' | 'post_gate';

export function getRuntimeRolloutStage(): RuntimeRolloutStage {
  const configured = process.env.NORMAL_RUNTIME_ROLLOUT_STAGE?.toLowerCase();
  if (configured === 'pre_gate') return 'pre_gate';
  return 'post_gate';
}

export function getRuntimeProvider(): RuntimeProvider {
  const configured = process.env.NORMAL_RUNTIME_PROVIDER?.toLowerCase();
  if (configured === 'codex') return 'codex';
  return 'codex';
}

export function createNormalRuntimeProcess(options: RuntimeProcessOptions): RuntimeProcess {
  return new CodexProcess(options);
}
