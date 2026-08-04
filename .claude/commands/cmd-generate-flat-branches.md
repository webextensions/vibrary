---
description: >-
  Bring the local "<branch>-flat" mirror branches up to date with their source branches by appending new
  first-parent commits - append-only, local refs only, never pushes
argument-hint: [optional source branch]
---

# Generate Flat Branches (append-only linear mirrors)

Goal: keep each `<branch>-flat` mirror byte-identical to the template branch it mirrors, so a fork can fork from a
clean linear history and still merge future template updates. What the mirrors are for and how they work:
[docs/template-project/flat-branches.md](../../docs/template-project/flat-branches.md). The branch family itself is
described by the tree in [docs/template-project/README.md](../../docs/template-project/README.md).

The flattening is done by [scripts/branching/flatten-branch.sh](../../scripts/branching/flatten-branch.sh)
(`node --run branching:flatten`); the all-branches wrapper
[scripts/branching/flatten-template-prefixed-branches.sh](../../scripts/branching/flatten-template-prefixed-branches.sh)
(`node --run template:flatten-branches`) runs it for every local `template-*` branch that has a mirror. This
command is the orchestration around them.

## Scope

- No `$ARGUMENTS`: every local `template-*` branch (excluding the `*-flat` mirrors themselves) that already has a
  `<branch>-flat` mirror, via the wrapper - it discovers the branches itself (no hardcoded list) and skips branches
  without a mirror.
- `$ARGUMENTS` is a branch name: only that branch, via `node --run branching:flatten`. Naming a branch is also how
  a NEW mirror gets created; alternatively, when the human explicitly asks to create ALL missing mirrors, pass the
  wrapper's `--create-branches` flag. Never create mirrors the human did not ask for.
- A `-flat` ref whose source branch is missing locally is reported, not guessed at.

## Prepare

- Local refs only: do not fetch, pull, or push. The mirrors are built from whatever the local source branches point at,
  so if the human wants remote updates included, they update the source branches first.
- No checkout is needed and none should happen: the scripts are pure ref/object plumbing and never touch the working
  tree. The wrapper requires a clean tree; for a single branch, `branching:flatten` accepts `--allow-dirty` (its gate
  is a convention guard, not a correctness one).

## Run

All branches with an existing mirror (no `$ARGUMENTS`):

```sh
node --run template:flatten-branches
```

Only when the human explicitly asked to create all missing mirrors too:

```sh
node --run template:flatten-branches -- --create-branches
```

A single branch (`$ARGUMENTS`):

```sh
node --run branching:flatten -- --source <branch> --target <branch>-flat
```

Record the script's own verdict for each pair: appended N commit(s), or already up to date.

## Verify

- `git diff <source> <source>-flat` must be empty for every pair.
- `node --run branching:check-flat-branches` - re-asserts tree equality and trailer freshness for every local
  mirror (the wrapper already runs this at the end).

## Rules

- APPEND-ONLY. Never delete and rebuild a mirror: that changes every flat commit's sha and destroys the merge base of
  any fork that already merged it. If the script refuses to resume (missing `Template-Source-Commit` trailer), stop and
  report - do not "fix" it by recreating the branch.
- Never commit onto a `-flat` branch by hand; it is generated output.
- Never push, force-push, or delete any branch. Pushing the mirrors stays a human step.
- Use the AskUserQuestion tool if the repo state is surprising (an unexpected `-flat` ref, a diverged mirror).

## Report

- Per pair: appended N commit(s) with the new tip sha / already up to date / skipped with the reason.
- Any mirror the script refused to touch, quoting its error.
- The verification outcome.
- Finish with the closing section below.

## Closing: Push Status and Pushing

Nothing was pushed - reviewing and publishing stays the human's step. Per mirror, review with
`git log origin/<branch>-flat..<branch>-flat`. A mirror created in this run has no upstream at all, so it shows up as
`NEVER PUSHED` below. Then end the response with BOTH fenced blocks below, VERBATIM: they are hard-coded so every run
offers the same copy-pasteable pair - do not regenerate, shorten, or adapt them.

Push status of every local branch:

```sh
git fetch origin --prune && git for-each-ref --sort=refname --format='%(refname:short)%09%(upstream:short)%09%(upstream:track,nobracket)' refs/heads | awk -F'\t' '{printf "%-44s %s\n", $1, ($2=="" ? "NEVER PUSHED (no upstream)" : ($3=="" ? "in sync" : $3))}'
```

Each row reads `in sync`, `ahead N` / `behind N` / `ahead N, behind M`, or `NEVER PUSHED (no upstream)`.

Push everything that is ahead or was never pushed:

```sh
git fetch origin --prune && git for-each-ref --format='%(refname:short) %(upstream:trackshort)' refs/heads | awk '$2==">" || NF==1 {print $1}' | xargs -r -n1 git push -u origin
```

It deliberately pushes only the branches that are ahead or have no upstream yet; branches that are behind or diverged
are left alone for the human to reconcile first. Both cover ALL local branches, including any `-flat` mirrors.
