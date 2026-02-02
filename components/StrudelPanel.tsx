'use client';

import { forwardRef, useRef, useImperativeHandle, useCallback } from 'react';
import StrudelEditor from '@/components/StrudelEditor';

// Types
export interface StrudelPanelHandle {
  setCode: (code: string) => void;
  evaluate: (autostart?: boolean) => void;
  stop: () => void;
}

export interface StrudelPanelProps {
  initialCode?: string;
  className?: string;
  onError?: (error: Error | null) => void;
  onPlayStateChange?: (isPlaying: boolean) => void;
  onReady?: (handle: StrudelPanelHandle) => void;
}

const StrudelPanel = forwardRef<StrudelPanelHandle, StrudelPanelProps>(
  function StrudelPanel({ initialCode, className, onError, onPlayStateChange, onReady }, ref) {
    const editorRef = useRef<{ setCode: (code: string) => void; evaluate: (autostart?: boolean) => void; stop: () => void } | null>(null);

    // Create the handle object that will be shared via callback and ref
    const createHandle = useCallback((): StrudelPanelHandle => ({
      setCode: (code: string) => {
        editorRef.current?.setCode(code);
      },
      evaluate: (autostart?: boolean) => {
        editorRef.current?.evaluate(autostart);
      },
      stop: () => {
        editorRef.current?.stop();
      },
    }), []);

    const handleEditorReady = useCallback((editor: typeof editorRef.current) => {
      editorRef.current = editor;
      // Pass the handle directly through the callback (bypasses broken ref from next/dynamic)
      const handle = createHandle();
      onReady?.(handle);
    }, [onReady, createHandle]);

    useImperativeHandle(ref, createHandle, [createHandle]);

    return (
      <StrudelEditor
        initialCode={initialCode}
        onReady={handleEditorReady}
        onError={onError}
        onPlayStateChange={onPlayStateChange}
        className={className}
      />
    );
  }
);

export default StrudelPanel;
