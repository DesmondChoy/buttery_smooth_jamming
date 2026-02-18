# Technical Notes (V2 Jam Session)

Critical gotchas discovered during v2 implementation. **Reference this first when debugging.**

All v1 technical notes still apply — see [V1 Technical Notes](../v1-mvp/technical-notes.md).

---

## 1. MCP Server Build Step

The MCP server source is at `packages/mcp-server/src/index.ts` but Claude loads the compiled output from `packages/mcp-server/build/index.js` (which is gitignored).

**After editing the MCP server source, you MUST rebuild:**

```bash
cd packages/mcp-server && npm run build
```

Then restart the dev server for Claude to pick up the new binary.

## 2. `--verbose` Flag Required

When using `--output-format stream-json` with `--print`, the `--verbose` flag is **required**. Without it, the stream-json output is malformed or missing.

```bash
# Correct
claude --print --verbose --input-format stream-json --output-format stream-json

# Broken (silent failures)
claude --print --input-format stream-json --output-format stream-json
```

## 3. `ws` Native Addon in Next.js Webpack

The `ws` library includes native C++ addons (`bufferUtil`, `utf-8-validate`) for performance. When Next.js webpack bundles server-side code, it can't handle these native addons properly.

**Symptom:** WebSocket *connects* successfully but `send()` crashes:
```
TypeError: bufferUtil.mask is not a function
```

**Solution:** Don't create `ws` WebSocket clients in server-side code bundled by webpack. Instead, use the broadcast callback pattern — pass a closure from the route handler (which has access to the native `ws` via `next-ws`):

```typescript
// In claude-ws/route.ts
const broadcastToClient = (message) => {
  if (client.readyState === 1) {
    client.send(JSON.stringify(message));
  }
};
const manager = new AgentProcessManager({ broadcast: broadcastToClient });
```

## 4. Agent Process Flags

Agent processes use specific flags to disable tools and MCP:

```bash
claude --print --verbose --model sonnet \
  --input-format stream-json \
  --output-format stream-json \
  --system-prompt <agent-persona> \
  --no-session-persistence \
  --tools '' \                    # Disables all built-in tools
  --strict-mcp-config            # Don't load project MCP servers
```

- The `--model` value comes from each agent's YAML frontmatter in `.claude/agents/*.md` (currently `model: sonnet`)
- `--tools ''` eliminates ~20k tokens of tool definitions from each agent's context
- `--strict-mcp-config` prevents agents from connecting to the Strudel MCP server (they don't need it)
- Without both flags, agents may hallucinate MCP tool results

## 5. MCP Permission Bootstrapping

Claude Code prompts the user for permission on first use of each MCP tool. In jam mode, this caused the first 1-2 rounds to be lost.

**Fix:** `lib/claude-process.ts` passes `--allowedTools` with all MCP tool names pre-approved:

```typescript
'--allowedTools',
'mcp__strudel__execute_pattern',
'mcp__strudel__stop_pattern',
// ... all tool names
```

This only applies to the orchestrator process (normal mode). Agent processes don't use MCP tools at all.

## 6. LLM Enum Values

LLMs will use **any valid enum value** in a tool schema. If you add a status like `"playing"` to `update_agent_state`'s enum, agents will set it — even if you only intended it for internal use.

**Fix:** Only include enum values in the MCP tool schema that you want LLMs to set. Remove values that should be set programmatically.

## 7. Agent Key to File Mapping

Agent keys in code don't always match the `.claude/agents/` filename:

| Agent Key | Agent File | Display Name |
|-----------|-----------|--------------|
| `drums` | `drummer.md` | BEAT |
| `bass` | `bassist.md` | GROOVE |
| `melody` | `melody.md` | ARIA |
| `fx` | `fx-artist.md` | GLITCH |

This mapping is in `AgentProcessManager` — if you add a new agent, update it there.

## 8. React Compiler Compatibility

The React Compiler (enabled in this project) requires all values used inside hooks to be destructured or passed as dependencies. Avoid mutating objects inside `useEffect` or callbacks.

**Symptom:** Lint errors about "React Compiler" or "React Hooks rules."

**Fix:** Destructure jam callbacks before passing to `useEffect`:

```typescript
// Correct
const { handleAgentThought, handleAgentStatus } = jam;
useEffect(() => { handleAgentThought(data); }, [handleAgentThought]);

// Incorrect (React Compiler warns)
useEffect(() => { jam.handleAgentThought(data); }, [jam]);
```

## 9. Auto-Tick (Autonomous Evolution)

Agents don't just respond to boss directives — they autonomously evolve their patterns every 30 seconds via auto-tick.

**How it works:**
1. `AgentProcessManager.startAutoTick()` sets a 30-second `setInterval`
2. On each tick, all active agents receive an `AUTO-TICK — LISTEN AND EVOLVE` prompt with current band state
3. Agents can respond with `"no_change"` as their pattern to keep playing their current groove
4. A `tickInProgress` guard prevents overlapping ticks
5. The timer resets after each boss directive to avoid double-triggering

**Key detail:** `no_change` is handled specially in `applyAgentResponse()` — it preserves the existing pattern in `agentPatterns[key]` while still updating `thoughts` and `reaction`. On the first round, if no pattern exists yet, it falls back to `"silence"`.

## 10. Agent Strudel Reference Injection

Each agent process receives a shared Strudel API reference (`lib/strudel-reference.md`) prepended to its system prompt. This gives agents knowledge of valid Strudel functions, mini-notation syntax, and available sound banks without relying on tool definitions.

**Loaded at:** `AgentProcessManager` constructor reads the file once and caches it in `this.strudelReference`. It's injected into every agent's initial prompt context.

---

## Quick Reference Table

| Issue | Symptom | Fix |
|-------|---------|-----|
| MCP changes not picked up | Old tool behavior persists | Rebuild: `cd packages/mcp-server && npm run build` + restart dev |
| Agent stream-json broken | No output or malformed JSON | Add `--verbose` flag |
| WebSocket send crashes | `bufferUtil.mask is not a function` | Use broadcast callback, not `ws` client in webpack-bundled code |
| Agent hallucinating tools | Fake MCP results in output | Ensure `--tools '' --strict-mcp-config` flags |
| First jam round lost | Permissions dialog appears | Add `--allowedTools` to orchestrator process |
| Agents setting wrong status | LLM uses unexpected enum value | Remove unwanted values from tool schema |
| React Compiler lint errors | Hooks dependency warnings | Destructure callback objects before use in effects |
