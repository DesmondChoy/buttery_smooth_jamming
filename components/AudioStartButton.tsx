'use client';

import { useState, useEffect, useCallback } from 'react';

type AudioState = 'idle' | 'initializing' | 'ready' | 'error';

interface AudioStartButtonProps {
  onAudioReady?: () => void;
  onError?: (error: Error) => void;
  className?: string;
}

export function AudioStartButton({
  onAudioReady,
  onError,
  className = '',
}: AudioStartButtonProps) {
  const [audioState, setAudioState] = useState<AudioState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(true);

  // Check if audio is already running on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkExistingAudio = async () => {
      try {
        const { getAudioContext } = await import('@strudel/webaudio');
        const ctx = getAudioContext();
        if (ctx.state === 'running') {
          setAudioState('ready');
          setTimeout(() => setIsVisible(false), 300);
          onAudioReady?.();
        }
      } catch {
        // Audio not initialized yet
      }
    };
    checkExistingAudio();
  }, [onAudioReady]);

  const handleClick = useCallback(async () => {
    if (audioState === 'initializing' || audioState === 'ready') return;

    setAudioState('initializing');
    setErrorMessage(null);

    try {
      const { initAudio, getAudioContext } = await import('@strudel/webaudio');
      await initAudio();

      const ctx = getAudioContext();
      if (ctx.state !== 'running') {
        await ctx.resume();
      }

      if (ctx.state === 'running') {
        setAudioState('ready');
        onAudioReady?.();
        setTimeout(() => setIsVisible(false), 500);
      } else {
        throw new Error('Could not start audio. Please try again.');
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Failed to initialize audio');
      setAudioState('error');
      setErrorMessage(err.message);
      onError?.(err);
    }
  }, [audioState, onAudioReady, onError]);

  if (!isVisible) return null;

  return (
    <div
      className={`
        absolute inset-0 z-50
        flex flex-col items-center justify-center
        bg-gray-900/80 backdrop-blur-sm
        transition-opacity duration-300
        ${audioState === 'ready' ? 'opacity-0' : 'opacity-100'}
        ${className}
      `}
      role="dialog"
      aria-labelledby="audio-start-title"
      aria-describedby="audio-start-description"
    >
      <h2 id="audio-start-title" className="text-2xl font-bold text-white mb-2">
        Enable Audio
      </h2>
      <p id="audio-start-description" className="text-gray-400 mb-6 text-center max-w-md">
        Click below to enable audio playback. This is required by your browser before music can play.
      </p>

      <button
        onClick={handleClick}
        disabled={audioState === 'initializing'}
        className={`
          px-8 py-4 rounded-lg font-semibold text-lg
          transition-all duration-200 shadow-lg hover:shadow-xl
          flex items-center gap-3 disabled:cursor-not-allowed
          ${audioState === 'idle' ? 'bg-amber-500 hover:bg-amber-400 text-gray-900' : ''}
          ${audioState === 'initializing' ? 'bg-amber-500/70 text-gray-900 cursor-wait' : ''}
          ${audioState === 'ready' ? 'bg-green-500 text-white' : ''}
          ${audioState === 'error' ? 'bg-red-500 hover:bg-red-400 text-white' : ''}
        `}
      >
        {audioState === 'idle' && (
          <>
            <SpeakerIcon className="w-6 h-6" />
            Click to Enable Audio
          </>
        )}
        {audioState === 'initializing' && (
          <>
            <Spinner className="w-6 h-6" />
            Initializing...
          </>
        )}
        {audioState === 'ready' && (
          <>
            <CheckIcon className="w-6 h-6" />
            Audio Ready!
          </>
        )}
        {audioState === 'error' && (
          <>
            <SpeakerIcon className="w-6 h-6" />
            Retry
          </>
        )}
      </button>

      {errorMessage && (
        <p className="mt-4 text-red-400 text-sm max-w-md text-center">{errorMessage}</p>
      )}
    </div>
  );
}

// Icon components (inline SVGs)
function SpeakerIcon({ className = '' }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 001.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06zM18.584 5.106a.75.75 0 011.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 11-1.06-1.06 8.25 8.25 0 000-11.668.75.75 0 010-1.06z" />
      <path d="M15.932 7.757a.75.75 0 011.061 0 6 6 0 010 8.486.75.75 0 01-1.06-1.061 4.5 4.5 0 000-6.364.75.75 0 010-1.06z" />
    </svg>
  );
}

function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function CheckIcon({ className = '' }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
    </svg>
  );
}

export default AudioStartButton;
