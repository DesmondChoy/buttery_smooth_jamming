# AGENTS.md

This file mirrors `CLAUDE.md` for Codex and other agent-based tools.

## Project Overview

CC Sick Beats is an autonomous AI jam session where four band-member
agents (drums, bass, melody, FX) play together in real time via Strudel,
react to one another, and follow a human "boss" directing the session.

The core behavior in v2 is low-latency coordination via **per-agent
persistent Claude processes**. Targeted directives should stay in the
single-digit-second range, while preserving musical coherence through
shared context (key, scale, BPM, harmony, and recent band state).

This is a practical prototype-style project. Favor clear, working
solutions and fast iteration over heavy architecture.

## Operational Defaults

1. Read `docs/README.md` first for documentation map and current focus.
2. Treat `docs/v2-jam-session/README.md` and `docs/v2-jam-session/architecture.md`
   as the primary source of truth for active work.
3. Use `docs/v2-jam-session/technical-notes.md` first when debugging.
4. Preserve the dual-mode architecture (normal assistant mode + jam mode).
5. Prefer small, testable increments over broad rewrites.
6. Preserve existing conventions unless there is a concrete reason to change them.

## Environment and Commands

Do NOT use git worktrees. Work in the main working directory.

### JavaScript / TypeScript workflow

```sh
npm install
npm run dev
npm run lint
npm run build
npx vitest run
```

### MCP server workflow

The MCP server source is in `packages/mcp-server/src/`, but runtime uses
compiled output in `packages/mcp-server/build/`.

After editing MCP server source, rebuild before testing:

```sh
cd packages/mcp-server
npm run build
cd ../..
```

Then restart the app dev server so Claude picks up the updated MCP server.

### Python tooling (if needed)

Use `uv` for Python dependency operations:

```sh
uv add <package>
uv sync
uv run <command>
```

## Architecture Snapshot

### App and APIs (`app/`)

- `app/page.tsx` — Dual layout for normal mode and jam mode
- `app/api/claude-ws/route.ts` — Claude Terminal websocket + jam routing
- `app/api/ws/route.ts` — MCP bridge websocket endpoint

### UI (`components/`)

- Jam UI: `JamTopBar`, `JamControls`, `AgentColumn`, `BossInputBar`,
  `AgentSelectionModal`, `PatternDisplay`
- Normal mode UI: `TerminalPanel`, `StrudelPanel`, `StrudelEditor`

### Hooks (`hooks/`)

- `useJamSession` — Jam state, agent selection, directive routing
- `useClaudeTerminal` — Claude websocket stream + jam broadcast handling
- `useWebSocket`, `useStrudel` — Strudel connectivity and playback control

### Core server logic (`lib/`)

- `agent-process-manager.ts` — Per-agent persistent process lifecycle
- `claude-process.ts` — Single-process normal assistant mode
- `types.ts` — Shared contracts, including `AGENT_META` source-of-truth mapping
- `pattern-parser.ts` — Pattern parsing utilities

### Agents (`.claude/agents/`)

- `drummer.md` (BEAT), `bassist.md` (GROOVE), `melody.md` (ARIA), `fx-artist.md` (GLITCH)

### MCP server (`packages/mcp-server/`)

- `src/index.ts` — Tool server entrypoint and normal-mode tools
- `src/strudel-reference.ts` — Strudel docs exposed to tools

### Documentation (`docs/`)

- `docs/v2-jam-session/` — Active architecture, notes, implementation history
- `docs/v1-mvp/` — Historical reference for v1

### Tests

- `lib/__tests__/` — Unit tests for parsing and process-manager behavior

## Implementation Principles

- Keep deterministic `@mention` routing in code, not LLM inference.
- Preserve per-agent persistent processes in jam mode for low latency.
- Keep server-side composition of the final `stack()` pattern.
- Preserve the websocket broadcast-callback pattern to avoid `ws` native addon issues.
- Keep jam agents toolless (`--tools '' --strict-mcp-config`) unless intentionally changed.
- Treat `AGENT_META` and agent key mappings as canonical and update consistently.
- If you change MCP tool contracts, verify orchestrator permissions and rebuild MCP server.

## Code Style

- Imports: standard library, then third-party, then local.
- Naming: `snake_case` for functions/variables, `PascalCase` for classes/types/components.
- Keep comments concise and focused on non-obvious logic.
- Match existing TypeScript/React and hook dependency conventions.

## Quality Gate Before Commit

Before creating a commit:

1. Run `/quality` (or equivalent manual review) before finalizing changes.
2. Review complete changed files, not only diffs.
3. Run targeted checks for touched areas:
   - `npm run lint`
   - `npx vitest run` (or targeted vitest files)
   - `npm run build` for app-level/runtime-impacting changes
   - `cd packages/mcp-server && npm run build` when MCP server code changes
4. Remove dead code and debug remnants.
5. Verify no regressions in normal mode and jam mode flows relevant to the change.

If ambiguity is low-risk, proceed with explicit assumptions and document them.
If ambiguity affects correctness or architecture, ask one concise clarifying question.

## Issue Tracking with Beads (`bd`)

Use `bd` (beads) for issue tracking.

### Before starting work

- Run `bd list` (or `bd ready`) to find active work.
- If the task maps to an existing issue, reference its ID.
- If no issue exists, create one:

  ```sh
  bd create "Short descriptive title" -d "Description of what needs to be done"
  ```

### During implementation

- Set status when claiming work:

  ```sh
  bd update <id> --status in_progress
  ```

- Reference issue IDs in commits when relevant.

### After completing work

- Close done issues:

  ```sh
  bd close <id>
  ```

- Sync issue state with git:

  ```sh
  bd sync
  ```

### Key commands

| Action | Command |
|---|---|
| List issues | `bd list` |
| Find ready work | `bd ready` |
| Show issue details | `bd show <id>` |
| Create issue | `bd create "title" -d "description"` |
| Mark in progress | `bd update <id> --status in_progress` |
| Close issue | `bd close <id>` |
| Sync with git | `bd sync` |

## Session Completion

When ending a session:

1. File follow-up issues for unfinished work.
2. Run relevant quality gates for changed code.
3. Update/close issue statuses in `bd`.
4. Sync and push:

   ```sh
   git pull --rebase
   bd sync
   git push
   git status
   ```

5. Ensure the branch is clean or intentionally dirty with clear handoff notes.
