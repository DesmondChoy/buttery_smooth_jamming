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
}

const StrudelPanel = forwardRef<StrudelPanelHandle, StrudelPanelProps>(
  function StrudelPanel({ initialCode, className, onError }, ref) {
    const editorRef = useRef<{ setCode: (code: string) => void; evaluate: (autostart?: boolean) => void; stop: () => void } | null>(null);

    const handleEditorReady = useCallback((editor: typeof editorRef.current) => {
      editorRef.current = editor;
    }, []);

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
        className={className}
      />
    );
  }
);

export default StrudelPanel;
