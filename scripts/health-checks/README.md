# Health Checks

The repository's health-check suite. The orchestrator [all-is-well.ts](all-is-well.ts) runs every check and reports a
single pass/fail - `node --run test` (and the husky pre-commit / pre-push / post-merge hooks) run exactly this.

This README covers the overall approach, the run modes, and the configuration system. It deliberately does not
describe the individual checks: the `healthChecks` array in [all-is-well.ts](all-is-well.ts) is the source of truth
for the check list and launch order, and each check is documented by the comment above its const there.

## Approach

- Each check is a small independent command (a script under [checks/](checks/) or a `package.json` script) declared
  as an entry in the `healthChecks` array: a `name`, the command, and an actionable `errorMsg` that tells the user
  exactly what to run next when it fails.
- Checks run concurrently by default (via `concurrently`, with timestamped per-check prefixes); pass
  `--sequentially` (or use `node --run all-is-well:sequentially`) to run them one at a time when debugging
  interleaved output.
- Failures are loud: every failed check prints its `errorMsg`, the suite exits non-zero, and a desktop notification
  fires (configurable, see below). Only a full pass is ever treated as success.
- Every check's pass is cached individually against the git content state (commit shas excluded, so a commit that
  changes nothing keeps the entries valid - pre-push reuses what pre-commit just verified), and later runs skip
  exactly the checks that already passed - see
  [checksExecutionCaching/README.md](checksExecutionCaching/README.md) and
  [.claude/rules/checks-execution-caching.md](../../.claude/rules/checks-execution-caching.md).

## Run modes

- `node --run test` - the full suite (this is what the git hooks run).
- `node --run test:optimize-for-change` - change-aware: skips the checks whose `changeDependencies` match no
  **staged** paths; all other checks always run.
- `node --run all-is-well -- --sequentially` - one check at a time.
- `node --run all-is-well -- --no-cache`, or `HEALTHCHECKS_NO_CACHE=1 node --run test` - force a full run
  (`node --run test -- --no-cache` does NOT forward the flag; use the env var on that path).

## Configuration

The suite reads a layered config; exactly one file is loaded:

- `all-is-well.config.local.ts` - git-ignored (via the sibling [.gitignore](.gitignore)), machine-local; wins when
  present. It imports the base config and deep-merges its overrides over it (via `extend`) - the merge lives inside
  the file itself, so the loader stays trivial. Create it by duplicating
  [all-is-well.config.local.example.ts](all-is-well.config.local.example.ts) and renaming the copy.
- [all-is-well.config.ts](all-is-well.config.ts) - the committed base, loaded when no local file exists. On this
  branch it disables `npm-audit-signatures` on local (non-CI) runs.
- With neither file present, no configuration applies.

Available options (full shape in [allIsWellConfig/types.ts](allIsWellConfig/types.ts)):

- Per-check `disable` - `true`, or `{ disableOnCi: true }` / `{ disableOnLocal: true }` ("local" means
  `process.env.CI` is not set).
- Per-check `disableCache` - the check always executes (its cache entries are never read or written); the other
  checks may still skip via their own entries.
- Per-check `env` - merged over the check's built-in env.
- Global `disableCache` - like `--no-cache` / `HEALTHCHECKS_NO_CACHE` (which still win).
- Global `disableNotifications` - skip the desktop popup on failure.
- Global `runSequentially` - sequential by default; the `--sequentially` flag ORs with it.

A config entry naming an unknown check fails the suite (a typo must not silently disable nothing). The loading and
filtering logic lives in [allIsWellConfig/](allIsWellConfig/).

## Directory layout

- [all-is-well.ts](all-is-well.ts) - the orchestrator (check list, launch order, run modes, cache wiring)
- [all-is-well.config.ts](all-is-well.config.ts) - committed base config
- [all-is-well.config.local.example.ts](all-is-well.config.local.example.ts) - template for the git-ignored
  machine-local config
- [allIsWellConfig/](allIsWellConfig/) - config types, loader, and check-resolution helpers
- [checks/](checks/) - the individual check scripts (plus their own configs, e.g. `status-of-files.config.ts`)
- [checksExecutionCaching/](checksExecutionCaching/) - the result cache (see its README for the architecture)
- [helpers/](helpers/) - shared helper code (the `markdown-relative-links` ESLint rule and its test)
