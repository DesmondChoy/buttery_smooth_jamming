/**
 * Runtime bridge for genre-specific energy guidance.
 * Parses .codex/skills/genre-energy-guidance/SKILL.md at startup,
 * caches the result, and provides per-genre-per-role prompt sections.
 *
 * Follows the same skill → condensed runtime injection pattern as
 * jam-agent-shared-policy.ts.
 */

import * as fs from 'fs';
import * as path from 'path';

const SKILL_PATH = path.join(
  '.codex',
  'skills',
  'genre-energy-guidance',
  'SKILL.md'
);

/** genre (lowercase) → role → bullet lines */
type GuidanceMap = Map<string, Map<string, string[]>>;

let cachedGuidance: GuidanceMap | null = null;
let cachedWorkingDir: string | null = null;

/**
 * Parse the SKILL.md file into a genre → role → lines map.
 * Expected format:
 *   ## GenreName
 *   ### role
 *   - LOW (1-3): ...
 *   - MID (4-6): ...
 *   - HIGH (7-10): ...
 */
function parseSkillFile(filePath: string): GuidanceMap {
  const content = fs.readFileSync(filePath, 'utf-8');
  const map: GuidanceMap = new Map();

  let currentGenre: string | null = null;
  let currentRole: string | null = null;

  for (const line of content.split('\n')) {
    const genreMatch = line.match(/^## (.+)$/);
    if (genreMatch) {
      currentGenre = genreMatch[1].trim();
      currentRole = null;
      if (!map.has(currentGenre.toLowerCase())) {
        map.set(currentGenre.toLowerCase(), new Map());
      }
      continue;
    }

    const roleMatch = line.match(/^### (.+)$/);
    if (roleMatch && currentGenre) {
      currentRole = roleMatch[1].trim().toLowerCase();
      const genreMap = map.get(currentGenre.toLowerCase());
      if (genreMap && !genreMap.has(currentRole)) {
        genreMap.set(currentRole, []);
      }
      continue;
    }

    if (currentGenre && currentRole && line.startsWith('- ')) {
      const genreMap = map.get(currentGenre.toLowerCase());
      const lines = genreMap?.get(currentRole);
      if (lines) {
        lines.push(line);
      }
    }
  }

  return map;
}

function getGuidance(workingDir: string): GuidanceMap {
  if (cachedGuidance && cachedWorkingDir === workingDir) {
    return cachedGuidance;
  }

  const filePath = path.join(workingDir, SKILL_PATH);
  try {
    cachedGuidance = parseSkillFile(filePath);
    cachedWorkingDir = workingDir;
  } catch (err) {
    console.error('[GenreGuidance] Failed to load SKILL.md:', err);
    cachedGuidance = new Map();
    cachedWorkingDir = workingDir;
  }

  return cachedGuidance;
}

// Agent key → role name used in SKILL.md
const AGENT_KEY_TO_ROLE: Record<string, string> = {
  drums: 'drums',
  bass: 'bass',
  melody: 'melody',
  fx: 'fx',
};

const GENERIC_GUIDANCE: Record<string, string[]> = {
  drums: [
    '- LOW (1-3): Sparse, space-dominant — fewer hits, let silence speak.',
    '- MID (4-6): Core groove — kick/snare foundation with moderate texture.',
    '- HIGH (7-10): Full density — layered kit, active cymbal work, frequent fills.',
  ],
  bass: [
    '- LOW (1-3): Sparse, sustained — root notes, long tones.',
    '- MID (4-6): Core groove — root-fifth motion, moderate activity.',
    '- HIGH (7-10): Full motion — busy passing tones, octave runs.',
  ],
  melody: [
    '- LOW (1-3): Sparse, sustained — few notes, wide intervals.',
    '- MID (4-6): Core melody — stepwise phrases, chord-tone motion.',
    '- HIGH (7-10): Full expression — rapid runs, wide leaps, dense phrasing.',
  ],
  fx: [
    '- LOW (1-3): Subtle atmosphere — ambient pads, barely perceptible.',
    '- MID (4-6): Active texture — rhythmic effects, spatial movement.',
    '- HIGH (7-10): Dense chaos — distortion, noise layers, maximum density.',
  ],
};

/**
 * Build a prompt section with genre-specific energy guidance for one agent.
 * Returns an XML-tagged block, or empty string if genre is not available.
 */
export function buildGenreEnergySection(
  workingDir: string,
  genre: string,
  agentKey: string
): string {
  if (!genre) return '';

  const role = AGENT_KEY_TO_ROLE[agentKey];
  if (!role) return '';

  const guidance = getGuidance(workingDir);
  const genreMap = guidance.get(genre.toLowerCase());
  const lines = genreMap?.get(role) ?? GENERIC_GUIDANCE[role] ?? [];

  if (lines.length === 0) return '';

  return [
    `<genre_energy_guidance genre="${genre}">`,
    `Energy guidance for your role in ${genre}:`,
    ...lines,
    '</genre_energy_guidance>',
  ].join('\n');
}
