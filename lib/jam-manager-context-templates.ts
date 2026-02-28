import type { AudioContextSummary, AudioFeatureSnapshot, MusicalContext } from './types';
import { deriveAudioContextSummary, formatAudioContextForPrompt } from './audio-context';

export interface JamStartManagerContextInput {
  roundNumber: number;
  musicalContext: MusicalContext;
  bandStateLines: string[];
  audioFeedback?: AudioFeatureSnapshot;
  audioContextSummary?: AudioContextSummary;
}

export interface DirectiveManagerContextInput {
  roundNumber: number;
  musicalContext: MusicalContext;
  directive: string;
  isBroadcast: boolean;
  currentPattern: string;
  bandStateLines: string[];
  audioFeedback?: AudioFeatureSnapshot;
  audioContextSummary?: AudioContextSummary;
}

export interface AutoTickManagerContextInput {
  roundNumber: number;
  musicalContext: MusicalContext;
  currentPattern: string;
  bandStateLines: string[];
  audioFeedback?: AudioFeatureSnapshot;
  audioContextSummary?: AudioContextSummary;
}

function buildMusicalContextLines(musicalContext: MusicalContext): [string, string, string] {
  return [
    `Genre: ${musicalContext.genre}`,
    `Key: ${musicalContext.key} | Scale: ${musicalContext.scale.join(', ')} | BPM: ${musicalContext.bpm} | Time: ${musicalContext.timeSignature} | Energy: ${musicalContext.energy}/10`,
    `Chords: ${musicalContext.chordProgression.join(' → ')}`,
  ];
}

function buildAudioContextLines(
  audioFeedback: AudioFeatureSnapshot | undefined,
  audioContextSummary?: AudioContextSummary
): string[] {
  const summary = audioContextSummary
    ?? deriveAudioContextSummary(audioFeedback, { nowMs: Date.now() });

  const ageMs = audioFeedback ? Date.now() - audioFeedback.capturedAtMs : undefined;

  return formatAudioContextForPrompt(summary, {
    ageMs,
    includeScopeLine: true,
  });
}

export function buildJamStartManagerContext(input: JamStartManagerContextInput): string {
  const [genreLine, contextLine, chordLine] = buildMusicalContextLines(input.musicalContext);
  const audioLines = buildAudioContextLines(input.audioFeedback, input.audioContextSummary);

  return [
    'JAM START — CONTEXT',
    `Round: ${input.roundNumber} (opening)`,
    genreLine,
    contextLine,
    chordLine,
    '',
    ...audioLines,
    ...(audioLines.length > 0 ? [''] : []),
    'BAND STATE:',
    ...input.bandStateLines,
    '',
    'BOSS SAYS: No directives — free jam. Create your opening pattern.',
    '',
    'YOUR LAST PATTERN: None yet — this is your first round.',
  ].join('\n');
}

export function buildDirectiveManagerContext(input: DirectiveManagerContextInput): string {
  const { musicalContext } = input;
  const audioLines = buildAudioContextLines(input.audioFeedback, input.audioContextSummary);

  return [
    'DIRECTIVE from the boss.',
    `Round: ${input.roundNumber}`,
    '',
    input.isBroadcast
      ? `BOSS SAYS: ${input.directive}`
      : `BOSS SAYS TO YOU: ${input.directive}`,
    '',
    `Current musical context: Genre=${musicalContext.genre}, Key=${musicalContext.key}, BPM=${musicalContext.bpm}, Energy=${musicalContext.energy}/10`,
    `Scale: ${musicalContext.scale.join(', ')} | Chords: ${musicalContext.chordProgression.join(' → ')}`,
    `Your current pattern: ${input.currentPattern}`,
    '',
    ...audioLines,
    ...(audioLines.length > 0 ? [''] : []),
    'BAND STATE:',
    ...input.bandStateLines,
    '',
    'Respond with your updated pattern.',
  ].join('\n');
}

export function buildAutoTickManagerContext(input: AutoTickManagerContextInput): string {
  const [genreLine, contextLine, chordLine] = buildMusicalContextLines(input.musicalContext);
  const audioLines = buildAudioContextLines(input.audioFeedback, input.audioContextSummary);

  return [
    'AUTO-TICK — LISTEN AND EVOLVE',
    `Round: ${input.roundNumber}`,
    genreLine,
    contextLine,
    chordLine,
    '',
    ...audioLines,
    ...(audioLines.length > 0 ? [''] : []),
    'BAND STATE:',
    ...input.bandStateLines,
    '',
    `YOUR CURRENT PATTERN: ${input.currentPattern}`,
    '',
    'Listen to the band. If the music calls for change, evolve your pattern.',
    'If your groove serves the song, respond with "no_change" as your pattern.',
    'Avoid repeating "no_change" across many auto-ticks; introduce subtle variation when the pocket allows.',
    'Use "silence" on auto-tick only for deliberate strip-back/breakdown moments.',
    'Include a decision block if you feel the musical context should evolve.',
  ].join('\n');
}
