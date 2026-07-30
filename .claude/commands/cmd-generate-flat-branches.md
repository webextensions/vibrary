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
(`node --run branching:flatten`); this command is the orchestration around it.

## Scope

- No `$ARGUMENTS`: every source branch that ALREADY has a local `<source>-flat` ref. Discover them with
  `git for-each-ref --format='%(refname:short)' 'refs/heads/*-flat'` - do not work from a hardcoded list.
- `$ARGUMENTS` is a branch name: only that branch. This is also the only way a NEW mirror gets created - never create
  a mirror for a branch the human did not name.
- Only branches named in the README tree participate as sources. A `-flat` ref whose source branch is missing locally
  is reported, not guessed at.

## Prepare

- Local refs only: do not fetch, pull, or push. The mirrors are built from whatever the local source branches point at,
  so if the human wants remote updates included, they update the source branches first.
- No checkout is needed and none should happen: the script is pure ref/object plumbing and never touches the working
  tree. A dirty tree is fine - pass `--allow-dirty` (the script's gate is a convention guard, not a correctness one).

## Run

Per pair, oldest base branch first (order does not affect correctness, only readability of the report):

```sh
node --run branching:flatten -- --source <branch>
```

Record the script's own verdict for each: appended N commit(s), or already up to date.

## Verify

- `git diff <source> <source>-flat` must be empty for every pair.
- `node --run branching:check-flat-branches` - re-asserts tree equality and trailer freshness for every local
  mirror.

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
- The verification outcome, and a closing reminder that nothing was pushed: review with
  `git log origin/<branch>-flat..<branch>-flat` and push manually.
