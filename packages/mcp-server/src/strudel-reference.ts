// Strudel API reference documentation
// Reads from shared markdown file (single source of truth)
// Exposed as an MCP resource at strudel://reference

import { readFileSync } from 'fs';
import { join } from 'path';

// Read from shared markdown file at project root
// MCP server is always spawned from the project root by Claude
let reference: string;
try {
  reference = readFileSync(
    join(process.cwd(), 'lib', 'strudel-reference.md'),
    'utf-8'
  );
} catch (err) {
  console.error('[strudel-reference] Failed to load lib/strudel-reference.md:', err);
  reference = '# Strudel Pattern Reference\n\n(Reference file not found)';
}

export const STRUDEL_REFERENCE = reference;
