# Pattern Parsing Research: Approach Comparison

**Issue**: `buttery_smooth_jamming-m5e` (P4 research task)
**Date**: 2026-02-18
**Status**: Implemented (Approach A — Hybrid acorn + regex)

## Problem

During jam sessions, AI agents see raw Strudel code in BAND STATE:
```
🥁 BEAT (drums): stack(s("bd [~ bd] sd [bd ~]").bank("RolandTR909"), s("hh*4").gain(0.5))
```

Agents must "listen" to each other by parsing this code. A structured summary helps agents make better musical decisions.

## Approach Comparison

| # | Approach | Feasibility | Latency | Complexity | Accuracy | Verdict |
|---|----------|-------------|---------|------------|----------|---------|
| A | **Hybrid: acorn AST + regex** | High — acorn already in node_modules | <1ms | ~120 LOC | Good for all observed patterns | **SELECTED** |
| B | **Pure regex extraction** | Medium — breaks on nested structures | <0.1ms | ~50 LOC | Misses method chains, callbacks | Too fragile |
| C | **LLM pre-summarization** | High but expensive | 500-2000ms per call | Low code, high cost | Best possible | 12 calls/tick = 6-24s, exceeds budget |
| D | **Enhanced prompt heuristics** | Already shipped (buttery_smooth_jamming-lx3) | 0ms | Already done | Inconsistent — depends on LLM | Baseline, not sufficient |
| E | **Strudel runtime queryArc()** | Low — requires browser context | N/A | High | Would be perfect | @strudel/core needs browser window |

### Key Finding: Two Parsing Layers

Agent patterns have two nested DSLs:
- **Outer**: JS method chaining — `s("...").bank("X").gain(0.5)` (parsed with acorn)
- **Inner**: Mini notation — `"bd [~ bd] sd [bd ~]"` (parsed with regex tokenizer)

Initially planned to use `@strudel/mini`'s `getLeaves()` for inner parsing, but it transitively imports `@strudel/core` which requires browser globals. A regex tokenizer handles all observed agent patterns correctly.

## Implementation

**Selected: Approach A** — acorn for outer JS + regex for inner mini notation.

### Why
- Zero new dependencies (acorn already in node_modules)
- Negligible latency (<1ms for complex 3-layer stack patterns)
- Handles all observed pattern shapes from agent prompts
- Graceful degradation — returns null on parse failure, raw code always shown

### Files
- `lib/pattern-parser.ts` — Parser module (~120 lines)
- `lib/types.ts` — `PatternSummary` and `LayerSummary` interfaces
- `lib/agent-process-manager.ts` — `formatBandStateLine()` helper
- `lib/__tests__/pattern-parser.test.ts` — 27 unit tests

### What Agents See (Before vs After)

**Before:**
```
BAND STATE:
🥁 BEAT (drums): stack(s("bd [~ bd] sd [bd ~]").bank("RolandTR909"), s("hh*4").gain(0.5))
🎸 GROOVE (bass): note("c1 ~ eb1 g1").s("sawtooth").lpf(600).gain(0.6)
```

**After:**
```
BAND STATE:
🥁 BEAT (drums) [2 layers: bd sd (TR909) | hh, gain 0.5]: stack(s("bd [~ bd] sd [bd ~]").bank("RolandTR909"), s("hh*4").gain(0.5))
🎸 GROOVE (bass) [c1 eb1 g1, gain 0.6, lpf 600, sawtooth]: note("c1 ~ eb1 g1").s("sawtooth").lpf(600).gain(0.6)
```

Raw code stays (agents can still read it), bracketed summary provides quick comprehension.
