import type { MusicalContext } from './types';
import type { AudioFeatureSnapshot } from './types';

export interface JamStartManagerContextInput {
  roundNumber: number;
  musicalContext: MusicalContext;
  bandStateLines: string[];
  audioFeedback?: AudioFeatureSnapshot;
}

export interface DirectiveManagerContextInput {
  roundNumber: number;
  musicalContext: MusicalContext;
  directive: string;
  isBroadcast: boolean;
  currentPattern: string;
  bandStateLines: string[];
  audioFeedback?: AudioFeatureSnapshot;
}

export interface AutoTickManagerContextInput {
  roundNumber: number;
  musicalContext: MusicalContext;
  currentPattern: string;
  bandStateLines: string[];
  audioFeedback?: AudioFeatureSnapshot;
}

function buildMusicalContextLines(musicalContext: MusicalContext): [string, string, string] {
  return [
    `Genre: ${musicalContext.genre}`,
    `Key: ${musicalContext.key} | Scale: ${musicalContext.scale.join(', ')} | BPM: ${musicalContext.bpm} | Time: ${musicalContext.timeSignature} | Energy: ${musicalContext.energy}/10`,
    `Chords: ${musicalContext.chordProgression.join(' → ')}`,
  ];
}

function buildAudioFeedbackLines(audioFeedback: AudioFeatureSnapshot): string[] {
  const ageSeconds = Math.max(
    0,
    Math.round((Date.now() - audioFeedback.capturedAtMs) / 1000)
  );

  return [
    `AUDIO SNAPSHOT (${ageSeconds}s old):`,
    `- loudness=${audioFeedback.loudnessDb}/100 (approx loudness score)`,
    `- centroid=${audioFeedback.spectralCentroidHz}Hz`,
    `- band_energy: low=${audioFeedback.lowBandEnergy}, mid=${audioFeedback.midBandEnergy}, high=${audioFeedback.highBandEnergy}`,
    `- spectral_flux=${audioFeedback.spectralFlux}`,
    `- onset_density=${audioFeedback.onsetDensity}`,
  ];
}

export function buildJamStartManagerContext(input: JamStartManagerContextInput): string {
  const [genreLine, contextLine, chordLine] = buildMusicalContextLines(input.musicalContext);
  const audioLines = input.audioFeedback ? buildAudioFeedbackLines(input.audioFeedback) : [];

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
  const audioLines = input.audioFeedback ? buildAudioFeedbackLines(input.audioFeedback) : [];

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
  const audioLines = input.audioFeedback ? buildAudioFeedbackLines(input.audioFeedback) : [];

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
