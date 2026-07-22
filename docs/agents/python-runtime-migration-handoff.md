# Python Runtime Migration Handoff

Last updated: 2026-07-20.

## Current Stage

The TypeScript gateway to Python runtime migration has completed the protocol, worker scaffold,
TS adapter, Agent Run Stream contract, Python experiment performer, and TS runtime retirement-plan
slices.

Completed GitHub issues:

- #17 Define Agent Run worker protocol for Python runtime migration.
- #18 Scaffold Python LangGraph runtime worker.
- #19 Add TS API adapter for Python Agent Run worker.
- #20 Preserve frontend Agent Run streaming UX across Python runtime.
- #21 Add Python experiment performer for Optuna-style trials.
- #24 Create separate Python LangGraph runtime repository.
- #25 Decide Python runtime repo name/ownership.
- #26 Define schema sharing path.
- #27 Add local TS API discovery.
- #28 Define compatibility policy.
- #29 Scaffold external Python runtime repo.
- #22 Deprecate TS LangGraph runtime after Python parity.

Open GitHub issues:

- None for the TypeScript gateway migration umbrella.

## Local Repositories

TypeScript workspace:

- Path: `/home/yxluo/workspace/personal/agent-workbench`
- Recent commits:
  - `72289f2 test(web): preserve agent run stream contract`
  - `ddce61a feat(api): add python worker executor adapter`
  - `032cb0c feat(api): add python worker discovery config`
  - `bc4cd3d docs: define worker protocol compatibility policy`
  - `477bf2c feat(shared): publish agent run worker json schemas`
  - `d7e65e0 docs: record python runtime repository ownership`
  - `5decd2e feat(shared): define agent run worker protocol`

Python runtime repository:

- Path: `/home/chihaya-anon/workspace/agent-runtime-python`
- Remote: `tihaya-anon/agent-runtime-python`
- Recent commits:
  - `6f22012 chore: add python formatter and type checker`
  - `7f7c838 chore(hooks): run basedpyright on stop`
  - `75929cd chore(hooks): add Python formatting hook`
  - `a5897d3 feat: add experiment trial performer`
  - `958adc5 feat: emit agent run telemetry attributes`
  - `c2fa16c feat: add protocol-validating smoke worker`
  - `e57e71f chore: scaffold python runtime repository`

## Verification Already Run

For #19:

- `pnpm exec vitest run packages/agent/src/agent-run-executor.test.ts apps/api/src/python-worker-agent-run-executor.test.ts apps/api/src/agent-run-lifecycle.test.ts apps/api/src/python-worker-discovery.test.ts apps/api/src/routes/agent-runs.test.ts`
- `pnpm --filter @agent-workbench/api typecheck`
- `pnpm --filter @agent-workbench/agent typecheck`

For #20:

- `pnpm exec vitest run apps/api/src/routes/agent-runs.test.ts apps/api/src/python-worker-agent-run-executor.test.ts apps/web/src/lib/agent-run-stream-consumer.test.ts`
- `pnpm --filter @agent-workbench/api typecheck`
- `pnpm --filter @agent-workbench/web typecheck`

For the Python worker:

- `PYTHONDONTWRITEBYTECODE=1 uv run python -m unittest discover -s tests`
- `PYTHONDONTWRITEBYTECODE=1 uv run python -m agent_runtime_python.worker < /dev/null`

For #21:

- `PYTHONDONTWRITEBYTECODE=1 uv run python -m unittest discover -s tests`
- `PYTHONDONTWRITEBYTECODE=1 uv run python -m agent_runtime_python.experiment --message "Explain closures." --param style=concise,detailed --output /tmp/agent-runtime-trial-results.jsonl`

For #22:

- `pnpm exec vitest run packages/agent/src/agent-run-executor.test.ts packages/agent/src/archive/graph-factory-runtime/registration.test.ts packages/agent/src/archive/graph-factory-runtime/cli.test.ts apps/api/src/app.test.ts apps/api/src/python-worker-agent-run-executor.test.ts apps/api/src/routes/agent-runs.test.ts`
- `pnpm --filter @agent-workbench/agent typecheck`
- `pnpm --filter @agent-workbench/api typecheck`

## Deprecated TS Runtime Inventory

The remaining TS LangGraph runtime helpers live under explicit archive paths and are marked
deprecated:

- `packages/agent/src/archive/graph-factory-runtime/graph.ts`: archived LangGraph graph wrapper,
  annotations, telemetry context wrapper, and Graph Factory helper.
- `packages/agent/src/archive/graph-factory-runtime/registration.ts`: archived Graph Factory
  catalog, registration, Source Revision capture, and strict Agent Behavior Version assembly.
- `packages/agent/src/archive/graph-factory-runtime/cli.ts`: archived process-stdin Graph Factory
  request parser.
- `packages/shared/src/archive/graph-factory-runtime.ts`: archived Graph Factory runtime request
  schema.

These helpers are no longer exported from the active `@agent-workbench/agent` or
`@agent-workbench/shared` package roots. The shared request schema remains available only through
the explicit `@agent-workbench/shared/archive/graph-factory-runtime` compatibility subpath.

The tests that protect this archived compatibility surface are:

- `packages/agent/src/agent-run-executor.test.ts`: language-neutral executor contract remains the
  gateway seam.
- `packages/agent/src/archive/graph-factory-runtime/registration.test.ts`: archived catalog
  selection, registration, dirty-worktree enforcement, and behavior-version assembly.
- `packages/agent/src/archive/graph-factory-runtime/cli.test.ts`: archived Graph Factory runtime
  request parsing.
- `packages/shared/src/archive/graph-factory-runtime.test.ts`: archived request schema validation.
- `apps/api/src/app.test.ts`, `apps/api/src/python-worker-agent-run-executor.test.ts`, and
  `apps/api/src/routes/agent-runs.test.ts`: API Agent Runs are exposed only when an executor is
  configured, and the configured Python worker executor preserves gateway behavior.

## Next Recommended Slice

Remove the archived TS graph-factory runtime entirely once there is no historical compatibility
value in keeping the protected tests.
