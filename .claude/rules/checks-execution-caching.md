---
description: How checks-execution caching skips repeated health-check runs and how to force a fresh run
---

# Checks-Execution Caching - Skip Repeated Health-Check Runs

The full health-check suite ([scripts/health-checks/all-is-well.ts](../../scripts/health-checks/all-is-well.ts))
runs against the *same* git content through many surfaces: manual `node --run test`, the husky
**pre-commit** / **pre-push** / **post-merge** hooks (`node --run test`), pre-push moments after a
pre-commit, and AI automation jobs. To avoid re-running vitest, eslint, types (tsc), knip, npm-ci-dry,
and the other checks when nothing changed, every check's pass is cached INDIVIDUALLY and a later run
skips exactly the checks that already passed for the current content.

The cache code lives in
[scripts/health-checks/checksExecutionCaching/](../../scripts/health-checks/checksExecutionCaching/) - see its
[README.md](../../scripts/health-checks/checksExecutionCaching/README.md) for the architecture.

## What gets cached

- **One entry per check x git content state.** Passes are recorded per check, even when the suite
  overall FAILS - each individual pass is valid on its own. Failed checks are never written, so they
  always re-run. Partial runs (e.g. `--optimize-for-change`) seed entries that later full runs reuse.
- Caching is **ON by default for every surface, including the husky hooks.** To force a full run, set
  the `HEALTHCHECKS_NO_CACHE` env var (any non-empty value other than `0` / `false`, case-insensitive) -
  this works through
  `node --run test` - or pass `--no-cache` when invoking the script directly
  (`node --run all-is-well -- --no-cache`). Note that `node --run test -- --no-cache` does NOT work:
  `node` consumes the flag before the inner script sees it, so use the env var on that path.
- The all-is-well config (`all-is-well.config.ts` / the git-ignored `all-is-well.config.local.ts`; option shape in
  [scripts/health-checks/allIsWellConfig/types.ts](../../scripts/health-checks/allIsWellConfig/types.ts)) can
  also disable caching: a global
  `disableCache` acts like `--no-cache`, and a per-check `disableCache` makes that check always
  execute (its entries are never read or written) while the other checks may still skip.

## The cache key (why it is safe)

Per check, the entry is stored at
`.cache/checks-executions/checks/<gitContentHash>/<cacheKey>.json` (the whole `.cache/` tree is
git-ignored): the `gitContentHash` is the shard directory (one folder per content state, kept
un-crowded) and `cacheKey` is the filename - a filesystem-safe check name plus the first 16 hex of
`sha256(checkSignature)`, e.g. `eslint-staged.0fae...c3.json`. The signature is the check's name,
command, args, and effective env (built by `buildCheckCacheSignature` in
[scripts/health-checks/allIsWellConfig/resolveChecks.ts](../../scripts/health-checks/allIsWellConfig/resolveChecks.ts));
its hash in the filename keeps env variations distinct within a folder.

`gitContentHash = sha256(staged_tree_sha + worktree_plus_untracked_tree_sha)`:

- Both tree shas come from `git write-tree` against a THROWAWAY temp index (seeded by copying the real
  `.git/index`), so the real index is never rewritten and concurrent runs never collide.
- Git **tree** objects are timestamp-free pure content hashes - that is why we use them instead of
  `git stash create` (a stash is a commit embedding the current time and branch name, so its sha is not
  reproducible and would never hit the cache).
- The HEAD commit sha is deliberately NOT in the hash: a commit that changes no content keeps every
  entry valid, so pre-push skips the checks pre-commit just verified, and the same content is a HIT
  across branches and even across history rewrites.
- Folding the per-check signature (incl. effective env) into the key gives config-driven variations
  (per-check env overrides from the git-ignored local config) distinct keys - necessary because the
  local config file is invisible to the content hash.
- `eslint:staged` nuance: its key is content-only like every check, so its pass is reused across a
  commit / soft-reset even though the staged file SET changed. That is safe because the full-repo
  `eslint` check is keyed on the same trees and covers all worktree content.

## Accepted caveat

`git add -A` honors `.gitignore`, so changes to git-IGNORED paths (e.g. deleting `node_modules/`) and
uncommitted changes inside a submodule working tree are NOT part of the hash. A cached pass can be
stale in those cases. This is an accepted trade-off; force a fresh run with `--no-cache`. (The
git-ignored `all-is-well.config.local.ts` is the one mitigated case: behavior-affecting config changes
alter the per-check signature instead of the content hash.)

The cache fails OPEN: if the hash cannot be computed (not a git repo, or `git write-tree` fails
mid-merge) caching is silently disabled and the suite runs normally. Stale entries are pruned (best
effort) after 14 days, across all namespace directories.

## See Also

- [scripts/health-checks/all-is-well.ts](../../scripts/health-checks/all-is-well.ts) - the consumer (namespace `checks`)
- [scripts/health-checks/checksExecutionCaching/](../../scripts/health-checks/checksExecutionCaching/) - the cache module
- [.husky/](../../.husky/) - the hook scripts that run the suite (each header comment documents when it runs
  and whether it blocks); the `test` / `test:optimize-for-change` scripts are documented by their comments in
  [package.json.ts](../../package.json.ts)
