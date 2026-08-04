# Flattened Mirror Branches (`<branch>-flat`)

## Problem

This repository is a family of `abstract-` / `template-` branches connected by merges (base branches merge
down into higher-level branches - see [README.md](./README.md)). A real project forks from a `template-`
branch and keeps it up to date by regularly merging that branch back in. As a result, the fork inherits the
template's tangled multi-track history: many branches, many merge commits, many tracks that are noise from
the fork's point of view.

Goal: fork projects from a branch whose history is a clean, linear, one-commit-per-change track, while still
being able to pull future template updates by merging. Concretely: derive `template-web-app-flat` from
`template-web-app`, where each first-parent change on `template-web-app` becomes one commit on
`template-web-app-flat`, and fork from `-flat`.

## The pattern and its names

What is being described is a known pattern with several names:

- **Vendor branch** - a branch that carries an outside/upstream codebase in a form your project merges from.
  Here the "vendor" is another branch of the same repo.
- **History linearization / flattening** - the transformation itself (tree-like history -> linear history).
- **Publish / distribution (`dist`) branch** - a branch generated from a source branch, never committed to
  directly.
- **Google Copybara** is the closest real-world tool and has exactly the two relevant modes:
    - `SQUASH` - one destination commit per sync.
    - `ITERATIVE` - one destination commit per source commit. This is our model.
  Copybara tracks what was already migrated with a `GitOrigin-RevId: <sha>` trailer in each destination commit
  message. We copy that idiom (see "sync marker" below).

## Why native git alone is not enough

There is no single built-in git command that maintains this branch. The building blocks exist; the porcelain
shortcuts each fall short:

| Option | Verdict |
| --- | --- |
| `git merge --squash <source>` | This is Copybara's SQUASH mode: one commit per sync, wrong granularity. Worse, a squash commit shares no history with the source, so the merge-base never advances - a long-running fork re-resolves the same conflicts on every subsequent sync (well-documented "squash-merge decay"). |
| `git rebase` | Drops merge commits (that is flattening), but it REWRITES commits. Not append-only, so it is wrong for a permanently published branch that forks have already merged. |
| `git replay --advance=<branch> <range>` (2.44+) | Closest in spirit (replay a range onto a branch, bare-repo safe, atomic, no worktree). Two blockers: explicitly EXPERIMENTAL, and it fails with "replaying merge commits is not supported" - and our range always contains merges. |
| `git subtree split` | Nearest built-in precedent for an incremental derived branch that remembers its mapping - but it filters by directory, not by history shape. Not a fit, but confirms the plumbing approach is legitimate. |

Landing point: the mirrors are built from plumbing - `git rev-list --first-parent` + `git commit-tree` +
`git update-ref`.

## Mechanism

- **Walk `git rev-list --first-parent --reverse <range>`** - not `--no-merges`. A merge of a base branch (for
  example `abstract-ui-foundation`) into `template-web-app` becomes ONE flat commit carrying the merged result -
  the granularity you actually want ("one template update"). Walking `--no-merges` instead would interleave every
  base branch's individual commits and lose the merge resolutions. The same first-parent walk is used by
  [scripts/branching/find-safe-template-merge-commit.sh](../../scripts/branching/find-safe-template-merge-commit.sh).

- **Reuse each source commit's tree verbatim via `git commit-tree`:**

  ```sh
  tree="$(git rev-parse "$c^{tree}")"
  new="$(git commit-tree "$tree" -p "$parent" -m "$msg")"
  ```

  The tree OBJECT is copied; no patch is re-applied. So the flat branch is byte-identical to the source at each
  step, the operation can NEVER conflict, and it is deterministic.

- **Append-only, keyed on a sync marker.** Each flat commit ends with a blank line, then a trailer:

  ```
  Template-Source-Commit: <source-sha>
  ```

  A re-run reads the last flat commit's trailer, computes `range=<last-source-sha>..<source>`, appends only the
  new commits, and moves the branch with a single `git update-ref refs/heads/<target> <new-tip>`. Existing flat
  commits are never rewritten, so any fork that already merged them keeps a valid merge base.

  RULE: never regenerate the flat branch from scratch. Regenerating would give every flat commit a new sha,
  destroy every fork's merge base, and reintroduce exactly the repeated-conflict problem this avoids.

- **Reproducibility.** `GIT_AUTHOR_NAME/EMAIL/DATE` and `GIT_COMMITTER_NAME/EMAIL/DATE` are copied from each
  source commit into the `commit-tree` environment, so re-running produces identical flat shas. The blank line
  before the trailer keeps it readable by `git interpret-trailers` / `git log --format=%(trailers)`.

## The pieces

- **[scripts/branching/flatten-branch.sh](../../scripts/branching/flatten-branch.sh)**
  (`node --run branching:flatten`) - the generalized `<source> -> <target>` flattener implementing the mechanism
  above. Flags: `--source <ref>` and `--target <ref>` (both required, no defaults), and the optional
  `--allow-dirty`. It uses local refs only, never fetches or pushes, and never reads or writes the working tree
  or index - it moves exactly one ref, once, at the end.

- **[scripts/branching/flatten-template-prefixed-branches.sh](../../scripts/branching/flatten-template-prefixed-branches.sh)**
  (`node --run template:flatten-branches`) - the all-branches wrapper. Discovers every local `template-*`
  branch (excluding the `*-flat` mirrors themselves), runs the flattener for each with `--target <branch>-flat`,
  aborts on the first failure, and finishes with the check-flat-branches verifier. By default it refreshes only
  EXISTING mirrors (branches without one are skipped); `--create-branches` also creates the missing mirrors -
  creating one is an explicit opt-in because the first run flattens the branch's entire first-parent history.

- **[scripts/branching/check-flat-branches.ts](../../scripts/branching/check-flat-branches.ts)**
  (`node --run branching:check-flat-branches`) - read-only, on-demand verifier. For every local `*-flat` branch
  it asserts that the mirror's tree sha equals its source's, and that the mirror tip's `Template-Source-Commit`
  trailer is the source tip (catching a mirror that is merely stale). Mirrors are optional per checkout: with
  none present, the check passes.

- **[.claude/commands/cmd-generate-flat-branches.md](../../.claude/commands/cmd-generate-flat-branches.md)** -
  the `/cmd-generate-flat-branches` orchestration command: runs the all-branches wrapper (refreshing every
  existing `template-*` mirror; creating a mirror stays an explicit human ask), verifies, and reports. Local
  only, never pushes - matching the
  [`/cmd-merge-base-branches`](../../.claude/commands/cmd-merge-base-branches.md) cascade's discipline (which
  itself closes by running the wrapper, keeping the mirrors fresh after every cascade).

## Fork-side usage

A fork sets this repo as a remote and forks from `template-web-app-flat` instead of `template-web-app`
(the concrete setup commands: [SETUP-NEW-PROJECT.md](./SETUP-NEW-PROJECT.md)), then
pulls updates by merging `template-web-app-flat` - exactly the flow in [template-sync.md](./template-sync.md),
just pointed at the `-flat` branch. Because the flat branch is append-only and tree-identical, those merges
behave like normal template merges (fork-owned files such as `package.json.ts` identity still conflict as
expected; keep your side).

## Caveats and trade-offs

- A flat branch is GENERATED OUTPUT. Never commit onto it directly; it is only ever advanced by the flatten
  script. This fits the repo's "generated files are outputs, never sources" principle
  ([.claude/rules/first-principles.md](../../.claude/rules/first-principles.md)), and the verifier above is
  the generate-and-guard pair.
- Forks lose the ability to `git bisect` / `git blame` back into the abstract base branches. That is the trade
  being made deliberately in exchange for a clean linear fork history.
- One `-flat` branch per `template-` branch, produced by the same generalized script.
- Starting a mirror early is cheaper: the first run flattens the source branch's entire first-parent history.

## What NOT to do

- Do NOT have forks `git merge --squash` the template branch as a shortcut. A squash commit shares no history
  with the source, so the merge base never advances and the fork re-resolves the same conflicts on every
  subsequent sync. This is the exact failure mode the fork/merge model would hit.
- Do NOT adopt Copybara for this. It is the conceptually correct tool and worth reading for its design, but it
  is a Java/Bazel service aimed at cross-repo, bidirectional, transforming sync. This case is same-repo,
  one-directional, no transforms - a small script in `scripts/branching/` beats it.
- Do NOT regenerate the flat branch from scratch (see the append-only rule above).

## References

- git-replay(1): https://git-scm.com/docs/git-replay
- "Improve `git replay` so it can replay merges" (GitLab issue - documents the merge limitation):
  https://gitlab.com/gitlab-org/git/-/issues/384
- Git replay overview (LWN): https://lwn.net/Articles/963883/
- Google Copybara: https://github.com/google/copybara
- Copybara reference (workflow modes, `GitOrigin-RevId`):
  https://raw.githubusercontent.com/google/copybara/master/docs/reference.md
- Monorepos, the hub-and-spoke model, and Copybara (Dagster):
  https://dagster.io/blog/monorepos-the-hub-and-spoke-model-and-copybara
- bennorth/git-dendrify (linearize / dendrify): https://github.com/bennorth/git-dendrify
- Reoccurring conflicts after git squash merge (Sudolabs):
  https://sudolabs.com/insights/reoccurring-conflicts-after-git-squash-merge
- About pull request merges (GitHub Docs - squash merge-base behavior):
  https://docs.github.com/en/enterprise-server@3.0/github/collaborating-with-pull-requests/incorporating-changes-from-a-pull-request/about-pull-request-merges
- A rebasing vendor-branch workflow for Git:
  https://pdh11.blogspot.com/2018/12/a-rebasing-vendor-branch-workflow-for.html
- preed/git-vendor-mirror: https://github.com/preed/git-vendor-mirror
- "Vendor branch" in a git monorepo (David Rothlisberger): https://david.rothlis.net/vendor-branch/
