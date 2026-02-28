'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type { CSSProperties } from 'react';
import type {
  AgentState,
  JamChatMessage,
  AgentContextWindow,
} from '@/lib/types';
import { AGENT_META } from '@/lib/types';
import { get_agent_status_display } from '@/lib/agent-status-ui';

interface AgentColumnProps {
  agentKey: string;
  agentState: AgentState;
  isMuted?: boolean;
  messages: JamChatMessage[];
  isPatternChange?: boolean;
  contextWindow?: AgentContextWindow;
  isContextInspectorEnabled?: boolean;
}

function StatusDot({
  status,
  agentKey,
  isMuted = false,
}: {
  status: AgentState['status'];
  agentKey?: string;
  isMuted?: boolean;
}) {
  const { color_class, label } = get_agent_status_display(isMuted ? 'muted' : status);

  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2 h-2 rounded-full ${color_class}`} />
      <span className="text-xs text-stage-muted" {...(agentKey ? { 'data-testid': `status-label-${agentKey}` } : {})}>{label}</span>
    </div>
  );
}

function ColumnMessage({ message, agentKey }: { message: JamChatMessage; agentKey: string }) {
  const meta = AGENT_META[agentKey];

  if (message.type === 'boss_directive') {
    const isTargeted = message.targetAgent === agentKey;
    const isForOther = message.targetAgent && message.targetAgent !== agentKey;

    if (isForOther) {
      const targetMeta = AGENT_META[message.targetAgent!];
      return (
        <div className="px-2 py-1 text-xs text-stage-muted italic">
          BOSS spoke to {targetMeta?.name ?? message.targetAgent} privately.
        </div>
      );
    }

    return (
      <div className="px-2 py-1.5 bg-amber-900/20 border-l-2 border-amber-500/50">
        <span className="text-xs text-amber-400 font-semibold">
          BOSS{isTargeted ? ' (to you)' : ''}
        </span>
        <p className="text-xs text-amber-200">{message.text}</p>
      </div>
    );
  }

  if (message.type === 'system') {
    return (
      <div className="px-2 py-1 text-center">
        <span className="text-xs text-stage-muted italic">{message.text}</span>
      </div>
    );
  }

  const isCommentary = message.type === 'agent_commentary';

  return (
    <div className="px-2 py-1">
      {isCommentary && (
        <div className="flex items-baseline gap-1">
          <span className="text-xs text-stage-muted">(commentary)</span>
        </div>
      )}
      <p className={`text-xs ${isCommentary ? 'text-stage-text italic' : 'text-stage-text'}`}>
        {message.text}
      </p>
      {message.pattern && (
        <code className={`block text-xs font-mono mt-0.5 truncate ${meta?.colors.accent ?? 'text-stage-muted'}`}>
          {message.pattern}
        </code>
      )}
    </div>
  );
}

const AGENT_GLOW_STYLES: Record<string, string> = {
  drums: 'rgba(248, 113, 113, 0.45)',
  bass: 'rgba(96, 165, 250, 0.45)',
  melody: 'rgba(163, 163, 163, 0.45)',
  chords: 'rgba(232, 121, 249, 0.45)',
};

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function compactThreadId(threadId: string | null): string {
  if (!threadId) return 'none';
  if (threadId.length <= 12) return threadId;
  return `${threadId.slice(0, 6)}...${threadId.slice(-4)}`;
}

export function AgentColumn({
  agentKey,
  agentState,
  isMuted = false,
  messages,
  isPatternChange = false,
  contextWindow,
  isContextInspectorEnabled = false,
}: AgentColumnProps) {
  const meta = AGENT_META[agentKey];
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const glowColor = AGENT_GLOW_STYLES[agentKey] ?? 'rgba(245, 158, 11, 0.35)';
  const [inspectorOpen, setInspectorOpen] = useState(false);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    autoScrollRef.current = distanceFromBottom < 50;
  }, []);

  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (!meta) return null;

  return (
    <div
      data-testid={`agent-column-${agentKey}`}
      className={`flex flex-col min-h-0 min-w-0 bg-stage-black border border-stage-border ${
        isPatternChange ? 'agent-pattern-change-glow' : ''
      }`}
      style={{ '--agent-glow-color': glowColor } as CSSProperties}
      onMouseEnter={() => {
        if (isContextInspectorEnabled) {
          setInspectorOpen(true);
        }
      }}
      onMouseLeave={() => setInspectorOpen(false)}
    >
      {/* Header */}
      <div className="relative shrink-0">
        <div
          className={`flex items-center justify-between px-3 py-2 border-b border-stage-border ${meta.colors.bgSolid} ${isContextInspectorEnabled ? 'cursor-help' : ''}`}
          onClick={() => {
            if (isContextInspectorEnabled) setInspectorOpen((prev) => !prev);
          }}
        >
          <div className="flex items-center gap-2">
            <span className="text-base">{meta.emoji}</span>
            <span className={`text-sm font-bold ${meta.colors.accent}`}>{meta.name}</span>
            {isContextInspectorEnabled && (
              <span className="text-[10px] uppercase tracking-wide text-stage-muted">
                Context
              </span>
            )}
          </div>
          <StatusDot status={agentState.status} agentKey={agentKey} isMuted={isMuted} />
        </div>

        {isContextInspectorEnabled && inspectorOpen && (
          <div className="absolute z-20 left-2 right-2 top-full mt-1 max-h-[55vh] overflow-y-auto rounded-md border border-stage-border bg-stage-black/95 shadow-xl backdrop-blur">
            <div className="px-2.5 py-2 border-b border-stage-border bg-stage-dark/90">
              <p className="text-[11px] uppercase tracking-wide text-stage-muted">
                {meta.name} Context Window
              </p>
              {contextWindow?.lastCompaction && (
                <p className="text-[11px] text-amber-200 mt-1">
                  Last prune round {contextWindow.lastCompaction.appliedAtRound} | old thread {compactThreadId(contextWindow.lastCompaction.oldThreadId)}
                </p>
              )}
            </div>

            {!contextWindow || contextWindow.turns.length === 0 ? (
              <p className="px-2.5 py-3 text-xs text-stage-muted">
                No captured context yet for this agent.
              </p>
            ) : (
              <div className="p-2 space-y-2">
                {contextWindow.turns.map((turn) => (
                  <article key={turn.id} className="rounded border border-stage-border/80 bg-stage-dark/40">
                    <div className="px-2 py-1.5 border-b border-stage-border/70">
                      <p className="text-[11px] text-stage-text">
                        Round {turn.round} | {turn.turnSource} | {formatTime(turn.createdAt)} | {turn.outcome}
                      </p>
                      {turn.directive && (
                        <p className="text-[11px] text-amber-200 mt-1">
                          {turn.isBroadcastDirective ? 'BOSS (all):' : 'BOSS (targeted):'} {turn.directive}
                        </p>
                      )}
                    </div>

                    <div className="px-2 py-1.5 space-y-1.5">
                      <p className="text-[11px] text-stage-muted">
                        Thread {turn.thread.invocationMode} | before {compactThreadId(turn.thread.threadIdBefore)} | after {compactThreadId(turn.thread.threadIdAfter)}
                      </p>
                      <p className="text-[11px] text-stage-muted">
                        Compaction pending {turn.thread.pendingCompactionBefore ? 'Y' : 'N'} → {turn.thread.pendingCompactionAfter ? 'Y' : 'N'} | streak {turn.thread.noChangeStreakBefore} → {turn.thread.noChangeStreakAfter} | applied {turn.thread.compactionAppliedThisTurn ? 'Y' : 'N'}
                      </p>
                      <p className="text-[11px] text-stage-text">
                        Context: {turn.musicalContext.genre || 'N/A'} | {turn.musicalContext.key} | {turn.musicalContext.bpm} BPM | E{turn.musicalContext.energy}
                      </p>
                      <p className="text-[11px] text-stage-text">
                        Pattern in: <code className="font-mono text-[11px]">{turn.currentPattern}</code>
                      </p>
                      {turn.currentPatternSummary && (
                        <p className="text-[11px] text-stage-muted">
                          Pattern summary: {turn.currentPatternSummary}
                        </p>
                      )}
                      {turn.audioFeedback && (
                        <p className="text-[11px] text-stage-muted">
                          Audio: loudness {turn.audioFeedback.loudnessDb}, centroid {turn.audioFeedback.spectralCentroidHz}Hz, bands {turn.audioFeedback.lowBandEnergy}/{turn.audioFeedback.midBandEnergy}/{turn.audioFeedback.highBandEnergy}, flux {turn.audioFeedback.spectralFlux}, onset {turn.audioFeedback.onsetDensity}
                        </p>
                      )}
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-stage-muted">Band state passed</p>
                        <ul className="mt-1 space-y-1">
                          {turn.bandState.map((entry, idx) => (
                            <li key={`${turn.id}-band-${idx}`} className="text-[11px] text-stage-text">
                              <code className="font-mono break-all">{entry.line}</code>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <details className="rounded border border-stage-border/70 bg-stage-black/30">
                        <summary className="cursor-pointer px-2 py-1 text-[11px] text-stage-text">
                          Structured manager context
                        </summary>
                        <pre className="px-2 pb-2 text-[10px] leading-relaxed text-stage-text whitespace-pre-wrap break-words">
                          {turn.managerContext}
                        </pre>
                      </details>
                      <details className="rounded border border-stage-border/70 bg-stage-black/30">
                        <summary className="cursor-pointer px-2 py-1 text-[11px] text-stage-text">
                          Raw full prompt ({turn.rawPrompt.originalCharCount} chars{turn.rawPrompt.truncated ? `, capped at ${turn.rawPrompt.maxChars}` : ''})
                        </summary>
                        <pre className="px-2 pb-2 text-[10px] leading-relaxed text-stage-text whitespace-pre-wrap break-words">
                          {turn.rawPrompt.text}
                        </pre>
                      </details>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Message list */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        data-testid={`agent-messages-${agentKey}`}
        className="flex-1 overflow-y-auto overflow-x-hidden space-y-0.5 py-1"
      >
        {messages.length === 0 ? (
          <div className="text-stage-muted italic text-xs px-2 py-4 text-center">
            Waiting for {meta.name}...
          </div>
        ) : (
          messages.map((msg) => (
            <ColumnMessage key={msg.id} message={msg} agentKey={agentKey} />
          ))
        )}
      </div>
    </div>
  );
}
