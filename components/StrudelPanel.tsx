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
  onReady?: () => void;
}

const StrudelPanel = forwardRef<StrudelPanelHandle, StrudelPanelProps>(
  function StrudelPanel({ initialCode, className, onError, onPlayStateChange, onReady }, ref) {
    const editorRef = useRef<{ setCode: (code: string) => void; evaluate: (autostart?: boolean) => void; stop: () => void } | null>(null);

    const handleEditorReady = useCallback((editor: typeof editorRef.current) => {
      editorRef.current = editor;
      onReady?.();  // Notify parent that editor is ready
    }, [onReady]);

    useImperativeHandle(ref, () => ({
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
