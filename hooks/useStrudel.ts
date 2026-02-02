'use client';

import { useRef, useCallback } from 'react';
import type { StrudelPanelHandle } from '@/components/StrudelPanel';

export interface UseStrudelReturn {
  ref: React.RefObject<StrudelPanelHandle>;
  setCode: (code: string) => void;
  evaluate: (autostart?: boolean) => void;
  stop: () => void;
  onEditorReady: () => void;
}

export function useStrudel(): UseStrudelReturn {
  const ref = useRef<StrudelPanelHandle>(null!);

  // Queue state for commands that arrive before editor is ready
  const isReadyRef = useRef(false);
  const pendingCodeRef = useRef<string | null>(null);
  const pendingEvaluateRef = useRef<boolean | null>(null);

  const setCode = useCallback((code: string) => {
    if (isReadyRef.current && ref.current) {
      ref.current.setCode(code);
    } else {
      // Queue the code to be set when editor is ready
      pendingCodeRef.current = code;
    }
  }, []);

  const evaluate = useCallback((autostart?: boolean) => {
    if (isReadyRef.current && ref.current) {
      ref.current.evaluate(autostart);
    } else {
      // Queue the evaluate command
      pendingEvaluateRef.current = autostart ?? true;
    }
  }, []);

  const stop = useCallback(() => {
    // Only stop if editor is ready (nothing to stop otherwise)
    if (isReadyRef.current && ref.current) {
      ref.current.stop();
    }
  }, []);

  const onEditorReady = useCallback(() => {
    isReadyRef.current = true;

    // Flush any pending code
    if (pendingCodeRef.current !== null && ref.current) {
      ref.current.setCode(pendingCodeRef.current);
      pendingCodeRef.current = null;
    }

    // Flush any pending evaluate command
    if (pendingEvaluateRef.current !== null && ref.current) {
      ref.current.evaluate(pendingEvaluateRef.current);
      pendingEvaluateRef.current = null;
    }
  }, []);

  return { ref, setCode, evaluate, stop, onEditorReady };
}
