'use client';

interface JamControlsProps {
  isJamming: boolean;
  isRuntimeConnected?: boolean;
  isClaudeConnected?: boolean;
  onStartJam: () => void;
  onStopJam: () => void;
  className?: string;
}

export function JamControls({
  isJamming,
  isRuntimeConnected,
  isClaudeConnected,
  onStartJam,
  onStopJam,
  className = '',
}: JamControlsProps) {
  const runtimeConnected = isRuntimeConnected ?? isClaudeConnected ?? false;

  return (
    <div className={`bg-gray-800 border border-gray-700 rounded-lg p-4 ${className}`}>
      <div className="flex items-center gap-4">
        {isJamming ? (
          <button
            onClick={onStopJam}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium transition-colors"
          >
            Stop Jam
          </button>
        ) : (
          <button
            onClick={onStartJam}
            disabled={!runtimeConnected}
            className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Start Jam
          </button>
        )}

        {!runtimeConnected && !isJamming && (
          <span className="text-sm text-gray-500">Connect to runtime to start a jam</span>
        )}
      </div>
    </div>
  );
}
