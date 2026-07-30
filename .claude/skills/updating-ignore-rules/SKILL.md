---
name: updating-ignore-rules
description: Use when about to add, remove, or change entries in .gitignore, .git/info/exclude / docs/template-project/git-info-exclude.example, the eslint.config.js globalIgnores list, the tsconfig.json exclude list, or any similar ignore/exclude list, while on an abstract- or template- branch of this repository.
---

# Updating Ignore Rules

## Overview - which home does an entry belong to?

For `.gitignore` concerns there are three kinds of entries, each with its own home:

- **Family-wide artifacts** - things any branch can produce (caches, logs, `temp/`, `node_modules/`,
  `/.playwright-mcp/`, ...). Home: the root branch `abstract-javascript-project`'s `.gitignore`; the entry flows into
  every other branch via the usual template merges. Root-only editing applies (see "Decision" below).
- **Branch-structural artifacts** - things THIS branch's own layout produces (its build output, its local config, its
  runtime data). Home: the `.gitignore` of the branch (or family base branch) that introduces the structure - e.g.
  `.npmignore` concerns on `abstract-npm-package`, frontend build artifacts on `abstract-frontend-build`.
- **Other branches' leftovers** - artifacts of a DIFFERENT branch showing up as `git status` noise after a branch
  switch. Deliberately NOT in any committed `.gitignore`: a base branch must not describe descendant structure. Home:
  each clone's untracked `.git/info/exclude`, seeded from
  [docs/template-project/git-info-exclude.example](../../../docs/template-project/git-info-exclude.example) via
  `node --run setup:git-exclude`. When a branch introduces a new artifact pattern, it appends that pattern to the
  example file (additive lines merge cleanly down the family; the example is a convenience seed, not a strict-sync
  file).

Purposeful divergence is still allowed where it provides value - e.g. the git-ignored `config/*.local*.js` files are
deliberately NOT in the ESLint `globalIgnores` / tsconfig `exclude` lists, so errors in these machine-local files
still surface via lint / type-check.

## Applies To

- `.gitignore` - per the three-tier model above
- `.git/info/exclude` and `docs/template-project/git-info-exclude.example` - other branches' leftovers
- The following keep the old root-only model FOR NOW (how/whether they adopt a similar per-clone mechanism is an
  explicitly deferred decision):
    - `.cursorignore` - what Cursor keeps out of its AI indexing
    - `eslint.config.js` and `eslint.markdown.config.js` - the `globalIgnores` lists
    - `tsconfig.json` - the `exclude` list
    - `.block-non-keyboard-characters.suppressions.json` - the `exemptions` array
- Any other ignore/exclude list carrying the same cross-branch NOTE comment

## Per-directory tracked .gitignore

To ignore a directory's contents while keeping the directory present in the repo, use a tracked `.gitignore` inside
that directory (the pattern `template-web-app` uses for `app-data/database/*/.gitignore` with `*` + `!/.gitignore`,
and for `config/encryption/keys/.gitignore`). On branches where those tracked per-directory files do not exist, the
leftover contents are hidden per clone via `.git/info/exclude` (see Overview) - the root `.gitignore` does not carry
blanket entries for them.

The same mechanism covers a single generated file next to tracked ones: `.vscode/soft-links/.gitignore` ignores only
the generated `node` symlink while keeping its `setup.sh` tracked.

## Decision

Classify the entry first (Overview above), then check the current branch (`git branch --show-current`):

- Other branches' leftovers: on ANY `abstract-` / `template-` branch, do not touch a committed `.gitignore`. Add the
  pattern to `docs/template-project/git-info-exclude.example` on the branch that introduces the artifact (if not
  already there), and tell the developer to run `node --run setup:git-exclude` locally.
- Branch-structural entry: edit the `.gitignore` of the branch/family base that owns the structure - legitimate on
  that branch, wrong anywhere else.
- Family-wide entry (and every list still under the root-only model, e.g. ESLint / tsconfig / `.cursorignore`):
    - On `abstract-javascript-project`: make the edit here, keeping the existing NOTE comment and entry style.
    - On any other `abstract-` or `template-` branch: do NOT make the edit - not even "temporarily" or "also here for
      now". Print the warning below and stop.
- On any other branch (a forked project / npm package repo): this skill does not apply; handle the request normally.

## The Warning (family-wide entry requested on a non-root `abstract-` / `template-` branch)

Do not edit the file. Print this (adapted to the concrete file and entry) and leave the change to the developer:

> **WARNING: Not applying this ignore-rule change on the current branch.**
>
> Family-wide ignore/exclude entries (`.gitignore` artifacts any branch can produce, `eslint.config.js`
> `globalIgnores`, `tsconfig.json` `exclude`, ...) are edited only in the `abstract-javascript-project` branch and
> flow into every other `abstract-` / `template-` branch via the usual template merges. Editing the list on this
> branch would make the branches diverge and cause merge conflicts across the whole branch family.
>
> To apply the change: checkout `abstract-javascript-project`, add the entry there (next to the NOTE comment in the
> file), commit, then merge it down (see `/cmd-merge-template-branches`).
>
> If the entry is about another branch's leftover artifacts, it does not belong in a committed file at all - add it
> to `docs/template-project/git-info-exclude.example` and run `node --run setup:git-exclude` instead.

## Rationalizations - All Mean STOP

| Thought | Reality |
|---------|---------|
| "A directory from another branch shows as noise here - add it to .gitignore" | Other branches' leftovers never go in a committed `.gitignore`. That is exactly what `.git/info/exclude` (seeded from the example file) is for. |
| "This branch's base is `abstract-frontend-build`, so edit the family-wide list there" | For a family-wide entry, the home is the root branch `abstract-javascript-project`. A sub-family base branch is the home only for structural entries its family introduces. |
| "It is one line; add it here now and upstream it later" | That one line diverges the family and conflicts on the next template merge. Print the warning instead. |
| "I will checkout `abstract-javascript-project` and commit it myself" | The human owns git state (see `.claude/rules/git-workflow.md`). Print the warning; the developer switches branches. |
| "I will write into .git/info/exclude directly for the user" | `.git/` is the developer's local git state. Update the example file where warranted and point them at `node --run setup:git-exclude`; touch their exclude only when they explicitly ask. |
