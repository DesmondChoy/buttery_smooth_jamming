'use client';

import { useEffect, useRef } from 'react';

// Type definitions for the Strudel web component
interface StrudelEditorElement extends HTMLElement {
  editor: {
    setCode: (code: string) => void;
    evaluate: (autostart?: boolean) => void;
    stop: () => void;
    toggle: () => void;
    code: string;
  };
}

interface StrudelEditorProps {
  initialCode?: string;
  onReady?: (editor: StrudelEditorElement['editor']) => void;
  className?: string;
}

export function StrudelEditor({
  initialCode = '',
  onReady,
  className = ''
}: StrudelEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<StrudelEditorElement | null>(null);

  useEffect(() => {
    let mounted = true;
    const container = containerRef.current;

    async function initStrudel() {
      // Dynamic import to avoid SSR issues
      await import('@strudel/repl');

      if (!mounted || !container) return;

      // Create the web component
      const strudelEditor = document.createElement('strudel-editor') as StrudelEditorElement;
      if (initialCode) {
        strudelEditor.setAttribute('code', initialCode);
      }

      container.appendChild(strudelEditor);
      editorRef.current = strudelEditor;

      // Wait for editor to initialize
      requestAnimationFrame(() => {
        if (strudelEditor.editor && onReady) {
          onReady(strudelEditor.editor);
        }
      });
    }

    initStrudel();

    return () => {
      mounted = false;
      if (editorRef.current && container) {
        container.removeChild(editorRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Initialize once on mount; props are captured at mount time
  }, []);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ minHeight: '200px' }}
    />
  );
}

export default StrudelEditor;
