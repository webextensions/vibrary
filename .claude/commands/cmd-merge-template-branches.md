---
description: >-
  Merge base template branches into the higher-level branches built on them, per the branching tree in
  docs/template-project/README.md - resolves conflicts, runs tests, commits locally, never pushes
argument-hint: [optional target branch, or "<branch> subtree"]
---

# Merge Template Branches (base -> higher-level cascade)

Goal: propagate shared updates down the template branch family by merging each base branch into the branches built on
it, following the "Git Branching Tree" in [docs/template-project/README.md](../../docs/template-project/README.md),
top-down. This is a goal, not a script: plan the concrete git steps yourself each run from the current state of the
repo and the tree. Commit merge results locally; pushing is always the human's job.

## Scope

- No `$ARGUMENTS`: full cascade over every base -> child edge of the tree.
- `$ARGUMENTS` is a branch name: merge only that branch's base(s) into it.
- `$ARGUMENTS` is `<branch> subtree`: that branch, then cascade through all of its descendants.
- Only branches named in the README tree participate. Anything else (for example an origin-only branch that the tree
  does not mention) is out of scope for both sides of a merge.

## Read the Tree

- Parse the branching tree from the README at runtime - both the fenced ASCII tree and the trailing "There are some
  more branches" list below it. Never hardcode branch names; the README is the single source of truth.
- Derive base -> child edges. Multi-base branches (for example `template-npm-package-with-backend-and-frontend`, which
  builds on two or more bases) get one edge per listed base, merged in the listed order.
- Order edges topologically: a branch receives all its incoming merges before being merged into its children.
- A branch in the README that exists neither locally nor on origin is excluded from the run (report it as
  aspirational). A multi-base branch merges only the bases that exist.
- A branch that exists only on origin: create the local tracking branch (`git checkout <branch>`) and report that.

## Prepare

- Require a clean working tree (`git status --porcelain` empty); stop immediately otherwise.
- Record the currently checked-out branch and restore it at the end of a successful run.
- `git fetch origin`, then fast-forward-only update each involved branch: `git fetch origin <branch>:<branch>` for
  branches that are not checked out, `git merge --ff-only @{u}` for the checked-out one. If a branch has diverged from
  origin (or has no upstream), do not force anything: continue on the local state and flag it prominently in the
  report so the human reconciles before pushing.

## Merge Each Edge

- `git checkout <child>`, then `git merge <base> --no-edit`.
- Already up to date: record it and move on (no commit).
- Conflicts: resolve per the rules below, get `node --run test` green in the working tree, then conclude the merge
  with a single `git commit --no-edit` (the pre-commit hook re-runs the suite).
- After every merged edge, clean or conflicted, run `node --run test` (the checks-execution cache keeps repeat runs
  cheap; the informational post-merge hook run does not replace this).

## Conflict Resolution

- Fork-owned files (listed in
  [docs/template-project/file-conventions.md](../../docs/template-project/file-conventions.md)): keep the child's side
  - `git checkout --ours -- <file>` - then stage that file by name.
- `package.json`: `git checkout --ours -- package.json`, run `./scripts/housekeeping/generate-package-json.sh`, stage
  `package.json` and `package-version.json` by name (the generator rewrites both; this mirrors
  [scripts/branching/merge-template-to-main.sh](../../scripts/branching/merge-template-to-main.sh)).
- `package-lock.json`: run `npm install`, then stage it.
- `package.json.ts`: resolve by hand first - keep the child's identity (`name` / `description` / URLs) and dependency
  blocks, take the base's shared structural changes - then regenerate and stage `package.json.ts`, `package.json`, and
  `package-version.json`.
- Any other (shared) file: understand both sides' intent (`git log` / `git show` of the relevant commits, the whole
  file, not just the markers); keep both when compatible. On a genuine contradiction, pause and ask the developer with
  the AskUserQuestion tool, presenting both sides with evidence - never guess.
- Stage only individually named resolved files (`git add <file> ...`); bulk staging (`git add -A`, `git add .`, etc.)
  stays denied.
- Before concluding: verify no unmerged paths remain and no stray conflict markers survive anywhere in the tree.

## Tests and Fix-Forward

- Branches differ in dependencies, but `node_modules/` carries over across checkouts: when checks fail only because
  the installed packages do not match the current branch's manifest (the npm-install check says to run npm install,
  or a dependency's binary is missing), run `npm ci` and rerun - that is an environment fix, not a commit.
- On a `node --run test` failure: diagnose and fix in the working tree, rerun - up to 10 attempts per edge.
- Commit only once green, and create at most ONE fix commit per edge (past-tense subject, for example
  "Fixed <X> after merging <base> into <child>"). On a conflicted edge, fold the fixes into the merge-concluding
  commit instead of a separate one. Never amend.
- Still failing after 10 attempts: stop the cascade. Leave the merge commit (or the in-progress merge) intact and the
  fix attempts uncommitted, stay on that branch, and report the exact state left behind.

## Post-Merge Follow-Ups

A merge brings the base's content over verbatim, but some of the child's own content describes the child and must be
adapted by hand after the merge commit - the merge itself cannot do it.

- After each edge's merge commit (and any fix commit), check whether the merged-in changes require branch-specific
  adaptation on the child. Typical places to inspect:
    - Branch-owned skills (for example `.claude/skills/running-the-project/` - what "running the project" means
      differs per branch).
    - Fork-owned docs and checklists (per
      [docs/template-project/file-conventions.md](../../docs/template-project/file-conventions.md)): `README.md` /
      `AGENTS.md` wording, `docs/init/CUSTOMIZE/` style checklists, branch-specific docs.
    - Code and config that reference what the merge changed (renamed scripts, moved files, new conventions).
- Perform the needed follow-up edits in the working tree, then PAUSE the cascade and ask the developer (via the
  AskUserQuestion tool) to review, stage, and commit them before continuing to the next edge - these follow-ups are
  the child's own content, so the human owns their staging and commit (never stage or commit them yourself).
- If nothing needs adapting for an edge, say so in the report and continue.

## Rules

- Never push or force-push, never amend, never skip hooks with `--no-verify`, never `git reset`,
  `git restore --staged`, or `git rm`.
- Never merge into or from a branch that the README tree does not name.
- Use the AskUserQuestion tool whenever a human opinion is needed (judgment-call conflicts, surprising repo state).
- If the run stops mid-cascade, stay on the affected branch and say so instead of restoring the original branch.

## Report

- Per edge: merged / already up to date / skipped - with the reason (aspirational branch, diverged, excluded).
- Conflicts per file and how each was resolved (kept child side / regenerated / merged both intents). Flag `AGENTS.md`
  keep-side resolutions so the human can port shared wording into the child by hand if wanted.
- Post-merge follow-up edits made per edge (or "none needed") and whether the developer committed them.
- Test outcomes, fix commits created, local tracking branches created, diverged branches needing attention.
- Close with the reminder that nothing was pushed: review each branch (`git log origin/<branch>..<branch>`) and push
  manually.
