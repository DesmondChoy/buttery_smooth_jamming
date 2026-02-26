import type { MusicalContext } from './types';

export interface JamStartManagerContextInput {
  roundNumber: number;
  musicalContext: MusicalContext;
  bandStateLines: string[];
}

export interface DirectiveManagerContextInput {
  roundNumber: number;
  musicalContext: MusicalContext;
  directive: string;
  isBroadcast: boolean;
  currentPattern: string;
  bandStateLines: string[];
}

export interface AutoTickManagerContextInput {
  roundNumber: number;
  musicalContext: MusicalContext;
  currentPattern: string;
  bandStateLines: string[];
}

function buildMusicalContextLines(musicalContext: MusicalContext): [string, string, string] {
  return [
    `Genre: ${musicalContext.genre}`,
    `Key: ${musicalContext.key} | Scale: ${musicalContext.scale.join(', ')} | BPM: ${musicalContext.bpm} | Time: ${musicalContext.timeSignature} | Energy: ${musicalContext.energy}/10`,
    `Chords: ${musicalContext.chordProgression.join(' → ')}`,
  ];
}

export function buildJamStartManagerContext(input: JamStartManagerContextInput): string {
  const [genreLine, contextLine, chordLine] = buildMusicalContextLines(input.musicalContext);

  return [
    'JAM START — CONTEXT',
    `Round: ${input.roundNumber} (opening)`,
    genreLine,
    contextLine,
    chordLine,
    '',
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
    'BAND STATE:',
    ...input.bandStateLines,
    '',
    'Respond with your updated pattern.',
  ].join('\n');
}

export function buildAutoTickManagerContext(input: AutoTickManagerContextInput): string {
  const [genreLine, contextLine, chordLine] = buildMusicalContextLines(input.musicalContext);

  return [
    'AUTO-TICK — LISTEN AND EVOLVE',
    `Round: ${input.roundNumber}`,
    genreLine,
    contextLine,
    chordLine,
    '',
    'BAND STATE:',
    ...input.bandStateLines,
    '',
    `YOUR CURRENT PATTERN: ${input.currentPattern}`,
    '',
    'Listen to the band. If the music calls for change, evolve your pattern.',
    'If your groove serves the song, respond with "no_change" as your pattern.',
    'Include a decision block if you feel the musical context should evolve.',
  ].join('\n');
}
