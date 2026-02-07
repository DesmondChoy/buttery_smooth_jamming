'use client';

interface JamControlsProps {
  isJamming: boolean;
  isClaudeConnected: boolean;
  onStartJam: () => void;
  onStopJam: () => void;
  className?: string;
}

export function JamControls({
  isJamming,
  isClaudeConnected,
  onStartJam,
  onStopJam,
  className = '',
}: JamControlsProps) {
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
            disabled={!isClaudeConnected}
            className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Start Jam
          </button>
        )}

        {!isClaudeConnected && !isJamming && (
          <span className="text-sm text-gray-500">Connect to Claude to start a jam</span>
        )}
      </div>
    </div>
  );
}
