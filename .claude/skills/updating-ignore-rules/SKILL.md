---
name: updating-ignore-rules
description: Use when about to add, remove, or change entries in .gitignore, the eslint.config.js globalIgnores list, the tsconfig.json exclude list, or any similar ignore/exclude list, while on an abstract- or template- branch of this repository.
---

# Updating Ignore Rules - Only on abstract-javascript-project

## Overview

The ignore/exclude lists are kept identical across all `abstract-` / `template-` branches: a git-ignored artifact left
behind by one branch (build output, local config) must not show up as `git status` noise or break ESLint / tsc after
checking out another branch. Their single home for edits is the root base branch `abstract-javascript-project`; from
there the change flows into every other branch via the usual template merges.

## Applies To

- `.gitignore`
- `eslint.config.js` - the `globalIgnores` list
- `tsconfig.json` - the `exclude` list
- Any other ignore/exclude list carrying the same cross-branch NOTE comment

## Decision

Check the current branch (`git branch --show-current`) first:

- On `abstract-javascript-project`: make the edit here, keeping the existing NOTE comment and entry style.
- On any other `abstract-` or `template-` branch: do NOT make the edit - not even "temporarily" or "also here for now".
  Print the warning below and stop.
- On any other branch (a forked project / npm package repo): this skill does not apply; handle the request normally.

## The Warning (when on a non-base `abstract-` / `template-` branch)

Do not edit the file. Print this (adapted to the concrete file and entry) and leave the change to the developer:

> **WARNING: Not applying this ignore-rule change on the current branch.**
>
> Ignore/exclude lists (`.gitignore`, `eslint.config.js` `globalIgnores`, `tsconfig.json` `exclude`, ...) are edited
> only in the `abstract-javascript-project` branch and flow into every other `abstract-` / `template-` branch via the
> usual template merges. Editing the list on this branch would make the branches diverge and cause merge conflicts
> across the whole branch family.
>
> To apply the change: checkout `abstract-javascript-project`, add the entry there (next to the NOTE comment in the
> file), commit, then merge it down (see `/cmd-merge-template-branches`).

## Rationalizations - All Mean STOP

| Thought | Reality |
|---------|---------|
| "This branch's base is `abstract-frontend-build`, so edit the list there" | The parent branch is not the home for ignore rules. The single home is the root branch `abstract-javascript-project` - exactly what the NOTE comments in these files say. |
| "It is one line; add it here now and upstream it later" | That one line diverges the family and conflicts on the next template merge. Print the warning instead. |
| "I will checkout `abstract-javascript-project` and commit it myself" | The human owns git state (see `.claude/rules/git-workflow.md`). Print the warning; the developer switches branches. |
| "This entry only matters on this branch" | The lists stay identical across branches on purpose. If an entry is genuinely impossible to carry on the base branch, ask the developer instead of editing. |
