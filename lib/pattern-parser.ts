/**
 * Pattern parser for agent Strudel code.
 *
 * Two-layer parsing:
 *   Outer: acorn AST for JS method chains (s("...").gain(0.5).bank("X"))
 *   Inner: regex-based extraction of mini notation tokens ("bd [~ bd] sd ~")
 *
 * Zero new dependencies — acorn is already used by Strudel's transpiler.
 * We intentionally avoid importing @strudel/mini because it transitively
 * pulls in @strudel/core (browser-only), which breaks in Node.js test/server contexts.
 */
import { parse } from 'acorn';
import type { PatternSummary, LayerSummary } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ASTNode = any;

// Known effect methods (value-bearing — we capture the first argument)
// Includes .s() which sets the sound source on note() patterns
const EFFECT_METHODS = new Set([
  'gain', 'lpf', 'hpf', 'room', 'delay', 'bank', 's',
  'distort', 'crush', 'coarse', 'speed', 'pan', 'vowel',
]);

// Known modifier methods (behavior-changing — we record the name + optional arg)
const MODIFIER_METHODS = new Set([
  'sometimes', 'rarely', 'every', 'fast', 'slow',
  'degradeBy', 'palindrome', 'euclid',
]);

/**
 * Extract leaf values from a mini notation string using regex.
 * Strips brackets, operators, and rest symbols to find sound/note names.
 *
 * Examples:
 *   "bd [~ bd] sd [bd ~]"  → ["bd", "sd"]
 *   "hh*4"                 → ["hh"]
 *   "c1 ~ eb1 g1"          → ["c1", "eb1", "g1"]
 *   "<bd sd> hh"            → ["bd", "sd", "hh"]
 */
function extractMiniLeaves(miniStr: string): string[] {
  // Remove brackets, angle brackets, and operators
  const cleaned = miniStr.replace(/[[\]<>]/g, ' ');
  // Split on whitespace, filter rests/numbers/operators/empty
  const tokens = cleaned.split(/\s+/).filter((t) => {
    if (!t || t === '~' || t === '-') return false;
    // Strip trailing modifiers like ? or *N
    const base = t.replace(/[?*].*$/, '');
    if (!base) return false;
    // Filter pure numbers (repeat counts like 4 in hh*4)
    if (/^\d+(\.\d+)?$/.test(base)) return false;
    return true;
  }).map((t) => t.replace(/[?*].*$/, '')); // Return clean token without ?/*

  return Array.from(new Set(tokens));
}

/**
 * Walk a call expression chain to extract source, effects, modifiers, and mini content.
 */
function extractLayerInfo(node: ASTNode): LayerSummary | null {
  let source: 'note' | 's' | null = null;
  let miniStr = '';
  const effects: Record<string, number | string> = {};
  const modifiers: string[] = [];

  // Walk the chain from outermost to innermost
  // e.g. s("bd sd").bank("X").gain(0.5)
  // AST: CallExpression(.gain) → MemberExpression → CallExpression(.bank) → ...
  let current = node;

  while (current) {
    if (current.type === 'CallExpression') {
      const callee = current.callee;

      // Direct function call: s("...") or note("...")
      if (callee.type === 'Identifier') {
        const name = callee.name;
        if (name === 's' || name === 'note') {
          source = name;
          if (current.arguments[0]?.type === 'Literal' && typeof current.arguments[0].value === 'string') {
            miniStr = current.arguments[0].value;
          }
        }
        break;
      }

      // Method call: .method(arg)
      if (callee.type === 'MemberExpression' && callee.property?.type === 'Identifier') {
        const methodName = callee.property.name;

        if (EFFECT_METHODS.has(methodName)) {
          const arg = current.arguments[0];
          if (arg?.type === 'Literal') {
            effects[methodName] = arg.value as number | string;
          }
        } else if (MODIFIER_METHODS.has(methodName)) {
          if (methodName === 'every' || methodName === 'euclid') {
            // Include numeric arguments: "every(4)", "euclid(5,8)"
            const args = current.arguments
              .filter((a: ASTNode) => a.type === 'Literal' && typeof a.value === 'number')
              .map((a: ASTNode) => a.value);
            modifiers.push(args.length ? `${methodName}(${args.join(',')})` : methodName);
          } else if ((methodName === 'fast' || methodName === 'slow' || methodName === 'degradeBy') && current.arguments[0]?.type === 'Literal') {
            modifiers.push(`${methodName}(${current.arguments[0].value})`);
          } else {
            modifiers.push(methodName);
          }
        }

        // Continue walking down the chain
        current = callee.object;
        continue;
      }
    }
    break;
  }

  if (!source) return null;

  const content = extractMiniLeaves(miniStr);
  return { source, content, effects, modifiers };
}

/**
 * Parse a Strudel pattern string into a structured summary.
 * Returns null if parsing fails (raw code is always shown as fallback).
 */
export function parsePattern(code: string): PatternSummary | null {
  if (!code || code === 'silence' || code === 'no_change') return null;

  try {
    // Wrap as assignment expression so acorn can parse it as a statement
    const wrapped = `const __expr = ${code}`;
    const ast = parse(wrapped, {
      ecmaVersion: 2022,
      sourceType: 'module',
    });

    // The expression is the init of the variable declarator
    const decl = (ast as ASTNode).body[0]?.declarations?.[0];
    if (!decl) return null;
    const expr = decl.init;

    // Check if it's a stack() call
    if (
      expr.type === 'CallExpression' &&
      expr.callee?.type === 'Identifier' &&
      expr.callee.name === 'stack'
    ) {
      const layers = expr.arguments
        .map((arg: ASTNode) => extractLayerInfo(arg))
        .filter((l: LayerSummary | null): l is LayerSummary => l !== null);

      if (layers.length === 0) return null;
      return { structure: 'stack', layers };
    }

    // Single expression (not wrapped in stack)
    const layer = extractLayerInfo(expr);
    if (!layer) return null;
    return { structure: 'single', layers: [layer] };
  } catch {
    return null;
  }
}

/**
 * Format a layer summary into a concise human-readable string.
 */
function formatLayer(layer: LayerSummary): string {
  const parts: string[] = [];

  // Content + qualifier (bank for s() patterns, synth for note() patterns)
  // Reads as "bd sd (TR909)" or "c1 eb1 g1 (sawtooth)" — qualifier right next to content
  let contentStr = layer.content.length > 0 ? layer.content.join(' ') : '';
  if (layer.effects.bank) {
    const bank = String(layer.effects.bank).replace('Roland', '');
    contentStr += contentStr ? ` (${bank})` : `(${bank})`;
  } else if (layer.source === 'note' && layer.effects.s) {
    contentStr += contentStr ? ` (${layer.effects.s})` : String(layer.effects.s);
  }
  if (contentStr) parts.push(contentStr);

  // Key effects (skip bank and .s(), already shown as qualifiers)
  const effectParts: string[] = [];
  if (layer.effects.gain !== undefined) effectParts.push(`gain ${layer.effects.gain}`);
  if (layer.effects.lpf !== undefined) effectParts.push(`lpf ${layer.effects.lpf}`);
  if (layer.effects.hpf !== undefined) effectParts.push(`hpf ${layer.effects.hpf}`);
  if (layer.effects.room !== undefined) effectParts.push(`room ${layer.effects.room}`);
  if (layer.effects.delay !== undefined) effectParts.push(`delay ${layer.effects.delay}`);
  if (layer.effects.distort !== undefined) effectParts.push(`distort ${layer.effects.distort}`);
  if (layer.effects.crush !== undefined) effectParts.push(`crush ${layer.effects.crush}`);

  if (effectParts.length > 0) parts.push(effectParts.join(', '));

  // Modifiers
  if (layer.modifiers.length > 0) {
    parts.push(`[${layer.modifiers.join(', ')}]`);
  }

  return parts.join(', ');
}

/**
 * Generate a compact human-readable summary of a Strudel pattern.
 * Returns null if the pattern can't be parsed.
 *
 * Example:
 *   Input:  stack(s("bd [~ bd] sd [bd ~]").bank("RolandTR909"), s("hh*4").gain(0.5))
 *   Output: "2 layers: bd sd (TR909) | hh, gain 0.5"
 */
export function summarizePattern(code: string): string | null {
  if (!code || code === 'silence' || code === 'no_change') return null;

  const parsed = parsePattern(code);
  if (!parsed) return null;

  if (parsed.structure === 'single') {
    const summary = formatLayer(parsed.layers[0]);
    return summary || null;
  }

  // Stack: "N layers: layer1 | layer2 | ..."
  const layerDescs = parsed.layers.map(formatLayer).filter(Boolean);
  if (layerDescs.length === 0) return null;
  return `${layerDescs.length} layers: ${layerDescs.join(' | ')}`;
}
