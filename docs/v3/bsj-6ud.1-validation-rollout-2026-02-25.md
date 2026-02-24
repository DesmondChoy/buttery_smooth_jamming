# bsj-6ud.1 Workstream G: Validation + Rollout Checkpoint (2026-02-25)

This checkpoint records current Workstream G execution status for:

1. regression validation (normal + jam flows),
2. benchmark readiness and measurement method,
3. staged rollout controls and fallback behavior.

## 1) Regression Validation

Executed on **2026-02-25 +08:00** from repository root:

```sh
npm run lint
npx vitest run
npm run build
```

Outcome:

1. `npm run lint` passed after adding Node-script globals in `eslint.config.mjs`.
2. `npx vitest run` passed (`11` files, `144` tests), including:
   - normal-mode runtime factory + Codex startup checks,
   - jam manager start/directive/stop/state invariants,
   - targeted directive routing/error invariants.
3. `npm run build` passed and generated app routes successfully.

## 2) Benchmark Method + Current Sandbox Blockers

Benchmark harness added:

- `scripts/benchmarks/run-bsj-6ud-1-benchmark.mjs`
- npm alias: `npm run benchmark:workstream-g`

Harness method (when run on an unrestricted local machine):

1. connect to `/api/ai-ws`,
2. measure repeated `start_jam` latency (4 agents),
3. measure repeated targeted `boss_directive` latency (`@BEAT`),
4. measure repeated broadcast `boss_directive` latency,
5. compute p50/p95 + success rate and write artifacts under `tmp/benchmarks/bsj-6ud.1-*`.

Attempted execution in this sandbox:

```sh
npm run benchmark:workstream-g -- --jam-start-runs 2 --targeted-runs 2 --broadcast-runs 2 --timeout-ms 20000
```

Blocked by sandbox network restrictions:

1. local socket connect fails with `EPERM` (`127.0.0.1:3000` / `::1:3000`),
2. `next dev` cannot bind `3000` (`listen EPERM`),
3. direct Codex inference attempts fail with stream disconnects to `chatgpt.com`.

Because of those constraints, **end-to-end p95 latency could not be measured in this sandbox**.

Gate targets to evaluate on unrestricted local run:

1. jam start p95 `<= 20s`,
2. targeted directive p95 `<= 8s`,
3. directive success rate `>= 98%`.

## 3) Staged Rollout + Fallback Controls

Implemented runtime rollout controls in `lib/runtime-factory.ts`:

1. `NORMAL_RUNTIME_PROVIDER` explicit override:
   - `codex` (force Codex),
   - `codex` (force Codex fallback).
2. `NORMAL_RUNTIME_ROLLOUT_STAGE` default selection when provider is not forced:
   - `pre_gate` => Codex default,
   - `post_gate` (default) => Codex default.

Coverage added in `lib/__tests__/runtime-factory.test.ts` for:

1. stage parsing (`pre_gate`/`post_gate`),
2. pre-gate fallback default behavior,
3. explicit provider overrides.

## 4) Remaining Work to Close bsj-6ud.1

Run benchmark harness on an unrestricted local environment and attach artifacts:

```sh
npm run dev
npm run benchmark:workstream-g -- --jam-start-runs 8 --targeted-runs 12 --broadcast-runs 12
```

Then update this report with measured p95 values and gate pass/fail status.
