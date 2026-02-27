'use client';

import { useState, useCallback } from 'react';
import { TerminalPanel } from './TerminalPanel';
import type { RuntimeStatus, TerminalLine } from '@/hooks/useRuntimeTerminal';

interface TerminalDrawerProps {
  lines: TerminalLine[];
  status: RuntimeStatus;
  isConnected: boolean;
  sendMessage: (text: string) => void;
  clearLines: () => void;
}

export function TerminalDrawer(props: TerminalDrawerProps) {
  const [open, setOpen] = useState(false);

  const toggle = useCallback(() => setOpen((prev) => !prev), []);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          onClick={close}
        />
      )}

      {/* Drawer panel + toggle tab */}
      <div
        className={`fixed top-0 left-0 h-full z-50 transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : '-translate-x-[400px]'
        }`}
      >
        <div className="w-[400px] h-full">
          <TerminalPanel
            lines={props.lines}
            status={props.status}
            isConnected={props.isConnected}
            sendMessage={props.sendMessage}
            clearLines={props.clearLines}
            className="h-full border-r border-stage-border"
          />
        </div>

        {/* Toggle tab — anchored to right edge of drawer so it's always visible */}
        <button
          onClick={toggle}
          className="absolute top-1/2 -translate-y-1/2 left-[400px] bg-stage-dark border border-stage-border border-l-0 rounded-r-lg px-1.5 py-3 text-stage-text hover:text-amber-glow transition-colors"
          aria-label={open ? 'Close terminal' : 'Open terminal'}
        >
          <svg
            className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </>
  );
}
