export type RuntimeStatus = 'connecting' | 'ready' | 'thinking' | 'done';

export interface RuntimeTurnMetrics {
  duration_ms?: number;
  cost_usd?: number;
}

export type RuntimeEvent =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'tool_use';
      toolName?: string;
      toolInput?: Record<string, unknown>;
    }
  | {
      type: 'tool_result';
      text: string;
    }
  | {
      type: 'status';
      status: RuntimeStatus;
      text?: string;
      metrics?: RuntimeTurnMetrics;
    }
  | {
      type: 'error';
      error: string;
    };

export interface RuntimeProcessOptions {
  workingDir?: string;
  wsUrl?: string;
  onEvent?: (event: RuntimeEvent) => void;
  onError?: (error: Error) => void;
  onExit?: (code: number | null) => void;
  onReady?: () => void;
}

export interface RuntimeProcess {
  start(): Promise<void>;
  send(text: string): void;
  isRunning(): boolean;
  stop(): Promise<void>;
}
