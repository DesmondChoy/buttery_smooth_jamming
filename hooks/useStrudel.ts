'use client';

import { useRef, useCallback } from 'react';
import type { StrudelPanelHandle } from '@/components/StrudelPanel';

export interface UseStrudelReturn {
  ref: React.RefObject<StrudelPanelHandle>;
  setCode: (code: string) => void;
  evaluate: (autostart?: boolean) => void;
  stop: () => void;
  onEditorReady: (handle: StrudelPanelHandle) => void;
}

export function useStrudel(): UseStrudelReturn {
  const ref = useRef<StrudelPanelHandle>(null!);

  // Store the editor handle directly (bypasses broken ref forwarding from next/dynamic)
  const editorHandleRef = useRef<StrudelPanelHandle | null>(null);

  // Queue state for commands that arrive before editor is ready
  const isReadyRef = useRef(false);
  const pendingCodeRef = useRef<string | null>(null);
  const pendingEvaluateRef = useRef<boolean | null>(null);

  const setCode = useCallback((code: string) => {
    const handle = editorHandleRef.current;
    if (isReadyRef.current && handle) {
      handle.setCode(code);
    } else {
      pendingCodeRef.current = code;
    }
  }, []);

  const evaluate = useCallback((autostart?: boolean) => {
    const handle = editorHandleRef.current;
    if (isReadyRef.current && handle) {
      handle.evaluate(autostart);
    } else {
      // Queue the evaluate command
      pendingEvaluateRef.current = autostart ?? true;
    }
  }, []);

  const stop = useCallback(() => {
    const handle = editorHandleRef.current;
    // Only stop if editor is ready (nothing to stop otherwise)
    if (isReadyRef.current && handle) {
      handle.stop();
    }
  }, []);

  const onEditorReady = useCallback((handle: StrudelPanelHandle) => {
    // Store the handle directly (bypasses broken ref forwarding from next/dynamic)
    editorHandleRef.current = handle;
    isReadyRef.current = true;

    // Flush any pending code
    if (pendingCodeRef.current !== null && handle) {
      handle.setCode(pendingCodeRef.current);
      pendingCodeRef.current = null;
    }

    // Flush any pending evaluate command
    if (pendingEvaluateRef.current !== null && handle) {
      handle.evaluate(pendingEvaluateRef.current);
      pendingEvaluateRef.current = null;
    }
  }, []);

  return { ref, setCode, evaluate, stop, onEditorReady };
}
