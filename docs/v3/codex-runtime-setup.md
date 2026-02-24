# Codex Runtime Setup (Workstream E)

This document captures the Codex runtime configuration and startup checks introduced for `bsj-3xy.4`.

## Canonical Config

Preferred project config location:

- `.codex/config.toml`

Current repository fallback (used when `.codex/` is read-only in sandboxed environments):

- `config/codex/config.toml`

Runtime code resolves config home in this order:

1. `.codex/config.toml`
2. `config/codex/config.toml`

Runtime reads the config file and injects equivalent Codex `-c key=value` overrides per command.
This avoids auth-state drift that can happen when forcing `CODEX_HOME` in multi-config environments.

## Profiles

Two Codex profiles are required and validated at runtime startup:

1. `normal_mode`
2. `jam_agent`

Profile intent:

- `normal_mode`: normal assistant mode, Strudel MCP enabled, default model `gpt-5-codex`
- `jam_agent`: jam sub-agent mode, MCP disabled, default model `gpt-5-codex-mini`

## Startup Checks

`CodexProcess.start()` now runs fail-closed availability checks before reporting ready state:

1. project Codex config exists (`.codex/config.toml` or `config/codex/config.toml`)
2. `codex` binary is present (`codex --version`)
3. auth is available (`codex login status`)
4. required profiles are resolvable (`normal_mode`, `jam_agent`)
5. required MCP server is visible for normal mode (`strudel`)

If any check fails, the websocket returns a clear runtime start error and does not proceed.

## Rollout Controls (Workstream G)

Normal-mode runtime selection is controlled by `lib/runtime-factory.ts` with two environment overrides:

1. `NORMAL_RUNTIME_PROVIDER` (explicit override)
   - `codex` => force Codex
   - `codex` => force Codex fallback
2. `NORMAL_RUNTIME_ROLLOUT_STAGE` (default selection when provider is not forced)
   - `pre_gate` => Codex default before benchmark/test gates pass
   - `post_gate` (default) => Codex-first default after gates pass

Operational fallback strategy:

- Keep `NORMAL_RUNTIME_ROLLOUT_STAGE=post_gate` in normal operation.
- If Codex runtime is unavailable in production-like usage, set `NORMAL_RUNTIME_PROVIDER=codex` temporarily while investigating.
- Remove the temporary override after Codex runtime health is restored.

## Quick Verification

Run from repo root:

```sh
codex --version
codex login status
codex exec -p normal_mode \
  -c 'profiles.normal_mode.model="gpt-5-codex"' \
  -c 'profiles.jam_agent.model="gpt-5-codex-mini"' \
  -c 'mcp_servers.strudel.command="node"' \
  -c 'mcp_servers.strudel.args=["packages/mcp-server/build/index.js"]' \
  --json --skip-git-repo-check --output-schema /tmp/missing.schema.json "probe"
codex mcp list --json \
  -c 'mcp_servers.strudel.command="node"' \
  -c 'mcp_servers.strudel.args=["packages/mcp-server/build/index.js"]'
```

Expected:

- version and login status succeed
- profile probe fails specifically on missing schema file (this confirms profile resolution without spending model tokens)
- MCP list includes `strudel`

## Notes

- Normal-mode Codex execution is now profile-based (`--profile normal_mode`) and no longer hardcodes MCP server registration inline.
- Runtime still overrides `mcp_servers.strudel.env.WS_URL` per request so dynamic host/port wiring continues to work.
