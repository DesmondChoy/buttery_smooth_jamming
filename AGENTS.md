# AGENTS.md

Codex instruction file for this repository. Keep this short, practical, and up to date.

## Scope and Priority

1. This file applies to the whole repo.
2. More deeply nested `AGENTS.md` files override this file for their subtree.
3. Direct user instructions override file instructions.

## Project Snapshot

Buttery Smooth Jamming is an autonomous AI jam session with four agents (drums, bass, melody, FX) using Strudel, coordinated by a human boss.

Current focus is v2 jam mode with low-latency coordination via per-agent persistent Codex-backed sessions.

## Read First

1. `docs/README.md` (documentation map)
2. `docs/v2-jam-session/README.md` (active implementation)
3. `docs/v2-jam-session/architecture.md` (source of truth)
4. `docs/v2-jam-session/technical-notes.md` (debugging first stop)

## Working Rules

1. Preserve dual-mode architecture (normal assistant mode + jam mode).
2. Keep deterministic `@mention` routing in code, not model inference.
3. Preserve per-agent persistent Codex-backed sessions in jam mode for latency.
4. Keep server-side composition of final `stack()` pattern.
5. Preserve websocket broadcast-callback pattern (avoid `ws` native addon pitfalls).
6. Keep jam agents toolless (`--tools '' --strict-mcp-config`) unless intentionally changed.
7. Treat `AGENT_META` and agent key mappings as canonical.
8. Prefer small, testable increments over broad rewrites.

## Repo Map (Quick)

- `app/page.tsx`: Normal mode + jam mode layout
- `app/api/ai-ws/route.ts`: Primary provider-neutral runtime websocket path
- `app/api/runtime-ws/route.ts`: Runtime websocket + jam routing (legacy path)
- `app/api/ws/route.ts`: MCP bridge websocket
- `hooks/useJamSession.ts`: Jam state and directive routing
- `hooks/useAiTerminal.ts`: Provider-neutral terminal hook alias
- `hooks/useRuntimeTerminal.ts`: Runtime stream handling and jam broadcast
- `lib/agent-process-manager.ts`: Per-agent persistent lifecycle
- `lib/codex-process.ts`: Single-process normal assistant runtime mode
- `lib/types.ts`: Shared contracts, includes `AGENT_META`
- `packages/mcp-server/src/`: MCP source
- `packages/mcp-server/build/`: MCP runtime output
- `.codex/agents/`: Agent behavior docs (canonical)
- `.codex/skills/`: Codex skill definitions (project-local)

Legacy compatibility shims still exist for transition safety and should not be used for new work.

## Commands

### JS/TS

```sh
npm install
npm run dev
npm run lint
npm run build
npx vitest run
```

### MCP server

After editing `packages/mcp-server/src/`, rebuild before testing:

```sh
cd packages/mcp-server
npm run build
cd ../..
```

Then restart the app dev server.

### Python (if needed)

Use `uv`:

```sh
uv add <package>
uv sync
uv run <command>
```

## Issue Tracking (`bd`)

Use beads for task tracking:

```sh
bd list
bd ready
bd show <id>
bd create "title" -d "description"
bd update <id> --status in_progress
bd close <id>
bd sync
```

## Quality Gate (Before Finishing)

Run relevant checks for touched areas:

1. `npm run lint`
2. `npx vitest run` (or targeted tests)
3. `npm run build` for app/runtime-impacting changes
4. `cd packages/mcp-server && npm run build` when MCP source changes

Also remove dead/debug code and verify no regression in relevant normal/jam flows.

## Style

1. Imports: standard library, third-party, local.
2. Naming: `snake_case` for vars/functions, `PascalCase` for types/components.
3. Keep comments concise and only for non-obvious logic.
4. Match existing TypeScript/React conventions.

## Maintenance Note

Keep this file concise. Put detailed design, rationale, and history in `docs/` and link to those docs here.

## Subagents

- ALWAYS wait for all subagents to complete before yielding.
- Spawn subagents automatically when:
    - Parallelizable work (e.g., install + verify, npm test + typecheck, multiple tasks from plan)
    - Long-running or blocking tasks where a worker can run independently.
    - Isolation for risky changes or checks
