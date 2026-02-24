import { ClaudeProcess } from './claude-process';
import { CodexProcess } from './codex-process';
import type { RuntimeProcess, RuntimeProcessOptions } from './runtime-process';

export type RuntimeProvider = 'codex' | 'claude';

export function getRuntimeProvider(): RuntimeProvider {
  const configured = process.env.NORMAL_RUNTIME_PROVIDER?.toLowerCase();
  if (configured === 'claude') return 'claude';
  return 'codex';
}

export function createNormalRuntimeProcess(options: RuntimeProcessOptions): RuntimeProcess {
  switch (getRuntimeProvider()) {
    case 'codex':
      return new CodexProcess(options);
    case 'claude':
      return new ClaudeProcess(options);
  }
}
