'use client';

import { useState, useCallback, useRef, FormEvent } from 'react';
import { AGENT_META } from '@/lib/types';
import { MentionSuggestions } from './MentionSuggestions';

interface BossInputBarProps {
  selectedAgents: string[];
  isConnected: boolean;
  isJamming: boolean;
  canSendDirectives: boolean;
  onSendDirective: (text: string, targetAgent?: string) => void;
}

// Parse @mention at the start of the message
function parseTargetFromText(text: string): { targetAgent?: string; cleanText: string } {
  const lower = text.toLowerCase();
  for (const [key, meta] of Object.entries(AGENT_META)) {
    const mention = meta.mention.toLowerCase();
    if (lower.startsWith(mention) && (lower.length === mention.length || lower[mention.length] === ' ')) {
      return { targetAgent: key, cleanText: text };
    }
  }
  return { cleanText: text };
}

export function BossInputBar({
  selectedAgents,
  isConnected,
  isJamming,
  canSendDirectives,
  onSendDirective,
}: BossInputBarProps) {
  const [inputValue, setInputValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredAgents = selectedAgents.filter((key) => {
    if (!mentionFilter) return true;
    const meta = AGENT_META[key];
    return meta.name.toLowerCase().startsWith(mentionFilter.toLowerCase());
  });

  const insertMention = useCallback((agentKey: string) => {
    const meta = AGENT_META[agentKey];
    if (!meta) return;
    // Replace @partial with @NAME
    const atIdx = inputValue.lastIndexOf('@');
    const before = atIdx >= 0 ? inputValue.slice(0, atIdx) : inputValue;
    setInputValue(before + meta.mention + ' ');
    setShowSuggestions(false);
    setMentionFilter('');
    setSelectedSuggestion(0);
    inputRef.current?.focus();
  }, [inputValue]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);

    // Detect @mention in progress
    const atIdx = val.lastIndexOf('@');
    if (atIdx >= 0) {
      const afterAt = val.slice(atIdx + 1);
      // Only show suggestions if @ is at start or preceded by space, and no space after partial
      const charBefore = atIdx > 0 ? val[atIdx - 1] : ' ';
      if ((charBefore === ' ' || atIdx === 0) && !afterAt.includes(' ')) {
        setShowSuggestions(true);
        setMentionFilter(afterAt);
        setSelectedSuggestion(0);
        return;
      }
    }
    setShowSuggestions(false);
    setMentionFilter('');
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showSuggestions && filteredAgents.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSuggestion((prev) => (prev + 1) % filteredAgents.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSuggestion((prev) => (prev - 1 + filteredAgents.length) % filteredAgents.length);
      } else if (e.key === 'Tab' || e.key === 'Enter') {
        if (showSuggestions && filteredAgents.length > 0) {
          e.preventDefault();
          insertMention(filteredAgents[selectedSuggestion]);
          return;
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowSuggestions(false);
      }
    }
  }, [showSuggestions, filteredAgents, selectedSuggestion, insertMention]);

  const handleSubmit = useCallback((e: FormEvent) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    const { targetAgent } = parseTargetFromText(trimmed);
    onSendDirective(trimmed, targetAgent);
    setInputValue('');
    setShowSuggestions(false);
  }, [inputValue, onSendDirective]);

  return (
    <div className="relative shrink-0">
      {showSuggestions && filteredAgents.length > 0 && (
        <MentionSuggestions
          agents={filteredAgents}
          selectedIndex={selectedSuggestion}
          onSelect={insertMention}
        />
      )}
      <form
        onSubmit={handleSubmit}
        className="flex items-center border-t border-gray-700 bg-gray-800"
      >
        <span className="text-amber-400 px-4 py-3 text-sm font-semibold shrink-0">BOSS &gt;</span>
        <input
          ref={inputRef}
          data-testid="boss-input"
          type="text"
          value={inputValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={
            !isConnected
              ? 'Connecting...'
              : !isJamming
                ? 'Start a jam first...'
                : !canSendDirectives
                  ? 'Choose a preset and press Play first...'
                  : 'Give a directive... (@ to mention an agent)'
          }
          disabled={!isConnected || !isJamming || !canSendDirectives}
          className="flex-1 bg-transparent text-white py-3 pr-4 outline-none placeholder-gray-500 disabled:opacity-50 text-sm font-mono"
          aria-label="Boss directive input"
        />
        <button
          type="submit"
          disabled={!isConnected || !isJamming || !canSendDirectives || !inputValue.trim()}
          className="px-4 py-3 text-amber-400 hover:text-amber-300 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium shrink-0"
          aria-label="Send directive"
        >
          Send
        </button>
      </form>
    </div>
  );
}
