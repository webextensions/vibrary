---
name: running-health-checks
description: Use when asked to run the project's checks/tests, or to diagnose a failing health-check suite - runs node --run test, isolates the failing check, and reports actionable results.
allowed-tools: Bash(node --run *)
---

# Running Health Checks

Run the project's health-check suite and report results. The suite, its launch order, and each
check's documentation live in the `healthChecks` array of
[scripts/health-checks/all-is-well.ts](../../../scripts/health-checks/all-is-well.ts); the
orchestrator and its flags are documented in
[docs/development/health-checks.md](../../../docs/development/health-checks.md).

## Steps

- Run the full suite:

  ```sh
  node --run test
  ```

  Passes are cached per check against the current git content; to force a fresh run use
  `HEALTHCHECKS_NO_CACHE=1 node --run test` (see
  [.claude/rules/checks-execution-caching.md](../../rules/checks-execution-caching.md)).

- If the suite fails, every failing check's `errorMsg` names the command to run next. Isolate with
  the individual scripts, for example:
    - **ESLint**: `node --run eslint` (markdown: `node --run eslint:markdown`)
    - **Types**: `node --run test:types`
    - **Vitest**: `node --run vitest`
    - **Knip**: `node --run knip`
    - **Non-keyboard characters**: `node --run block-non-keyboard-characters`
    - **Package sync**: `node --run test:compare-package-json-with-source`

- Report the results clearly:
    - List failures with file paths and line numbers.
    - Where an auto-fixer exists, suggest it first (`node --run eslint:fix`,
      `node --run block-non-keyboard-characters:fix`, `node --run claude-settings-sort:fix`,
      `node --run status-of-files:ensure`).
    - Never bypass a failing check (no `--no-verify`, no disable comments) - fix the cause or
      surface the blocker.
