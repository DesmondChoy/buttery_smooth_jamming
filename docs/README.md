# CC Sick Beats Documentation

A web app connecting Claude Code to Strudel.cc for AI-assisted live coding music.

## Status: MVP Complete ✅

All 3 phases have been implemented:
- **Phase 1:** Foundation + Strudel integration (audio works)
- **Phase 2:** MCP Server with bidirectional communication
- **Phase 3:** Web App with WebSocket bridge

## Documentation Map

| Document | Purpose |
|----------|---------|
| [Architecture](./architecture.md) | System design, diagrams, file structure |
| [Technical Notes](./technical-notes.md) | **Critical gotchas for debugging** |
| [Implementation](./implementation/) | Historical record of what was built |
| [Roadmap](./roadmap.md) | Optional features not yet built |

## Quick Start

```bash
# Start the web app
npm run dev

# In another terminal, start Claude Code
claude
```

Then ask Claude: *"Teach me the basics of Strudel patterns"*

## Design Philosophy

**Inspired by [strudel-mcp-bridge](https://github.com/phildougherty/strudel-mcp-bridge):**
- "Thin bridge" model: Claude generates code, server just forwards it
- Removed 1600 lines of validation → 336 lines by trusting Claude
- Minimal tools (4 total: execute, stop, send_message, get_user_messages)
- Zero config, embedded documentation as MCP resource

**Key principle: Prevent over-engineering. Only build what directly contributes to the core goal.**

## MVP vs Optional Features

| MVP (Built) | Optional (Back Burner) |
|-------------|------------------------|
| Web app with split panels | Pattern persistence (database) |
| MCP server with 4 tools | Session management |
| WebSocket bridge | Audio recording |
| Embedded Strudel reference | Learning/progress tracking |
| Bidirectional chat | Curriculum resource |

## End-to-End Verification

1. Start app: `npm run dev`
2. Open: http://localhost:3000
3. Click "Start Audio"
4. In another terminal: `claude` (from project root)
5. Tell Claude: "Teach me the basics of Strudel patterns"
6. Expected:
   - Claude reads `strudel://reference` resource
   - Claude sends explanations via `send_message` → appears in left panel
   - Claude executes patterns via `execute_pattern` → plays in right panel
   - Claude can stop with `stop_pattern`
   - User can reply in chat, Claude reads via `get_user_messages`

## File Count

| Approach | Files | Lines |
|----------|-------|-------|
| Original 8-phase plan | 50+ | 3000+ |
| MVP plan (estimated) | ~15 | 500-800 |
| **Actual implementation** | **~15** | **~1,150** (excl. reference doc) |

**Breakdown:**
- Web app (app/, components/, hooks/, lib/, types/): ~900 lines
- MCP server (packages/mcp-server/src/): ~250 lines (excl. 320-line reference doc)

## Sources

- [strudel-mcp-bridge](https://github.com/phildougherty/strudel-mcp-bridge) - Minimal bridge approach
- [strudel-mcp-server](https://github.com/williamzujkowski/strudel-mcp-server) - Full-featured reference
- [Strudel Integration Docs](https://strudel.cc/technical-manual/project-start/)
