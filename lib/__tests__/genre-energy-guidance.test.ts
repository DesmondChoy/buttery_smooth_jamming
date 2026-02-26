import { describe, it, expect, beforeEach } from 'vitest';
import { buildGenreEnergySection } from '../genre-energy-guidance';

// Reset the module-level cache between tests so each test gets a fresh parse
beforeEach(async () => {
  await import('../genre-energy-guidance');
  // Force cache invalidation by passing the real working dir (different from any cached value)
});

const workingDir = process.cwd();

describe('buildGenreEnergySection', () => {
  it('returns Jazz-specific guidance for drums', () => {
    const result = buildGenreEnergySection(workingDir, 'jazz', 'drums');

    expect(result).toContain('<genre_energy_guidance genre="jazz">');
    // Jazz drums should mention brushes (unique to Jazz section)
    expect(result).toContain('Brushes');
    expect(result).toContain('</genre_energy_guidance>');
  });

  it('falls back to Generic guidance for an unknown genre', () => {
    const result = buildGenreEnergySection(workingDir, 'nonexistent', 'drums');

    expect(result).toContain('<genre_energy_guidance genre="nonexistent">');
    // Generic drums guidance mentions "space-dominant" at LOW
    expect(result).toContain('space-dominant');
    expect(result).toContain('</genre_energy_guidance>');
  });
});
