# Health Checks

`node --run all-is-well` is the full check suite - and the sole step of `node --run test`. The
orchestrator [`all-is-well.ts`](../../scripts/health-checks/all-is-well.ts) documents everything in
place:

- The `healthChecks` array is the source of truth for **which checks run** and their **launch
  order** (concurrent by default, so checks can finish in any order); each check is described by
  the comment above its const.
- The usage header documents the flags (`--sequentially`, `--optimize-for-change`, `--no-cache`)
  and the per-check result cache (deep-dive:
  [checks-execution caching](../../.claude/rules/checks-execution-caching.md)).
- Configuration (disabling checks, per-check env, cache and notification opt-outs) is layered via
  [`all-is-well.config.ts`](../../scripts/health-checks/all-is-well.config.ts) and the git-ignored
  `all-is-well.config.local.ts`; the option shape is documented in
  [`allIsWellConfig/types.ts`](../../scripts/health-checks/allIsWellConfig/types.ts) and the
  local-file setup in
  [`all-is-well.config.local.example.ts`](../../scripts/health-checks/all-is-well.config.local.example.ts).

The suite also runs from the git hooks in [.husky/](../../.husky/) (installed by
[husky](https://typicode.github.io/husky/) via the `prepare` script on `npm install`); each hook
script's header comment documents when it runs and whether it blocks.
