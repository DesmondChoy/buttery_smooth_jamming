'use client';

import { useRef, useCallback } from 'react';
import type { StrudelPanelHandle } from '@/components/StrudelPanel';

export interface UseStrudelReturn {
  ref: React.RefObject<StrudelPanelHandle | null>;
  setCode: (code: string) => void;
  evaluate: (autostart?: boolean) => void;
  stop: () => void;
}

export function useStrudel(): UseStrudelReturn {
  const ref = useRef<StrudelPanelHandle | null>(null);

  const setCode = useCallback((code: string) => {
    ref.current?.setCode(code);
  }, []);

  const evaluate = useCallback((autostart?: boolean) => {
    ref.current?.evaluate(autostart);
  }, []);

  const stop = useCallback(() => {
    ref.current?.stop();
  }, []);

  return { ref, setCode, evaluate, stop };
}
