# Syncing Template Updates into a Forked Project

Common improvements are committed on the `template` branch and merged into each forked project's
`main` (branching vision and tree: [README.md](./README.md); initial setup of a forked project:
[SETUP-NEW-PROJECT.md](./SETUP-NEW-PROJECT.md)). From inside a forked project, with a
clean working tree:

```sh
# Bring template -> main, auto-resolving package.json / package-lock.json conflicts, then push
node --run template:merge-to-main
```

The script's upstream syncing is fast-forward-only: unpushed or diverged local commits on `template`
or `main` stop it with an error, and you reconcile them manually (push, or sort out the divergence)
before it will proceed - it never merges, rebases, or force-moves a branch to make the sync work.

That npm script bakes in the `template` -> `main` pair plus `--push`; for any other
pair, call the underlying script directly:
`./scripts/branching/merge-source-to-target.sh --source <source-branch> --target <target-branch>`
(add `--push` to push - the script does not push by default). With `--resolve-conflict-with-ai`, a
headless Claude run (prompt:
[scripts/branching/merge-source-to-target/prompt-resolve-conflict-with-ai.md](../../scripts/branching/merge-source-to-target/prompt-resolve-conflict-with-ai.md),
output logged under the git-ignored `.cache/merge-source-to-target/`) resolves the remaining
conflicts; such a run commits only with `--allow-ai-commit` and pushes only with `--push` plus
`--allow-ai-push` - without them it stops with the resolution staged for review.

If a merge is risky, find the newest template commit that merges cleanly *and* passes tests first:

```sh
node --run template:find-safe-merge-commit
# then, e.g.:
git merge <reported-commit> --no-edit
```

Its bare defaults (`--base main --source template`) fit a forked project; inside this repository pass the pair
explicitly, e.g. `--base <child-branch> --source <base-branch>`.

Which conflicts get auto-resolved (and how to handle the rest) is documented in the two scripts'
header comments:
[`merge-source-to-target.sh`](../../scripts/branching/merge-source-to-target.sh) and
[`find-safe-template-merge-commit.sh`](../../scripts/branching/find-safe-template-merge-commit.sh).

## Merging Base Branches Down Inside This Repository

Within `template-javascript-project.git` itself, each base branch is regularly merged into the
higher-level branches built on it, following the branching tree in [README.md](./README.md). The
Claude Code command
[`.claude/commands/cmd-merge-base-branches.md`](../../.claude/commands/cmd-merge-base-branches.md)
runs that cascade (fetch, fast-forward update, then per edge: merge via `merge-source-to-target.sh --local`, resolve
conflicts, test, commit, review the merged changes and commit any follow-up fixes - plus an optional npm-package
update per branch) and never pushes - reviewing and pushing the merged branches stays a human step.

## Flat Mirror Branches

A `template-` branch can also have an append-only, tree-identical `<branch>-flat` mirror with a linear
history, for forks that prefer not to inherit the template family's multi-track history. Merging
updates works the same way, just pointed at the `-flat` branch. The mirrors are refreshed by
`node --run template:flatten-branches` (single branch: `node --run branching:flatten`; orchestration:
the `/cmd-generate-flat-branches` command) and verified on demand
by `node --run branching:check-flat-branches`: [flat-branches.md](./flat-branches.md).
