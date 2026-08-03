---
description: >-
  Merge base branches into the higher-level branches built on them, per the branching tree in
  docs/template-project/README.md - runs each edge through merge-source-to-target.sh, resolves conflicts, reviews the
  merged changes and commits follow-up fixes, optionally refreshes npm packages per branch, runs tests, commits
  locally, never pushes
argument-hint: [optional target branch, "<branch> subtree", or "<source> into <target>"] [npm-update|no-npm-update] [patch|minor|major]
---

# Merge Base Branches (base -> higher-level cascade)

Goal: propagate shared updates down the template branch family by merging each base branch into the branches built on
it, following the "Git Branching Tree" in [docs/template-project/README.md](../../docs/template-project/README.md),
top-down. This is a goal, not a script: plan the concrete git steps yourself each run from the current state of the
repo and the tree. Commit merge results locally; pushing is always the human's job.

## Scope

- No `$ARGUMENTS`: full cascade over every base -> child edge of the tree (subject to the start-point question in
  "Upfront Questions" when the checked-out branch is not the root).
- `$ARGUMENTS` is a branch name: merge only that branch's base(s) into it.
- `$ARGUMENTS` is `<branch> subtree`: that branch, then cascade through all of its descendants.
- `$ARGUMENTS` is `<source> into <target>`: merge exactly that one edge, nothing else. Valid only when the README
  tree names `<source>` as a direct base of `<target>`; any other pair - reversed direction, a grandparent shortcut,
  branches the tree does not relate - stops immediately with an explanation (history decisions outside the tree stay
  the human's).
- Only branches named in the README tree participate. Anything else (for example an origin-only branch that the tree
  does not mention) is out of scope for both sides of a merge.
- `$ARGUMENTS` may additionally carry npm-update keywords, recognized by their literal spelling; everything that is
  not one of them is parsed as a branch name / `subtree` as above:
    - `no-npm-update` - merges only.
    - `npm-update` - full update session per branch.
    - `npm-update` followed by any of `patch` / `minor` / `major` - restrict the session to those tiers.
  Any of these counts as the human having already specified, so the npm question below is skipped.

## Upfront Questions

Every runtime doubt is resolved FIRST - before Read the Tree, Prepare, or any git operation - so the rest of the run
proceeds unattended. When both questions below apply, ask them together in ONE AskUserQuestion call.

- NPM updates: when `$ARGUMENTS` carried no npm-update keyword (see Scope), ask the question defined in "NPM Package
  Updates" below.
- Start point: only when the checked-out branch is NOT the root base branch (today `abstract-javascript-project`)
  AND `$ARGUMENTS` gave no scope (no branch name, no `subtree`, no `<source> into <target>`), ask which branch the
  run is triggered from, offering exactly:
    - `Root branch - full cascade (Recommended)` - every base -> child edge of the tree.
    - `Current branch - its descendants only` - the checked-out branch acts as a base and the cascade covers only
      the edges below it; nothing is merged INTO the checked-out branch itself.
  Skip the question when the checked-out branch is the root (the two answers coincide). If the checked-out branch is
  not named in the README tree, the current-branch option would be invalid: skip the question, run the full cascade
  from the root, and say why in the report.

## NPM Package Updates (optional, per branch)

A cascade is a natural moment to also refresh dependencies, so the run can pair each branch's merge with an npm
update. This is opt-in and decided ONCE, before any git operation, so the cascade itself runs unattended.

- When `$ARGUMENTS` did not already answer it (see Scope), ask with the AskUserQuestion tool - at the moment defined
  in "Upfront Questions" - offering exactly:
    - `No - merges only (Recommended)`
    - `Yes - patch/minor only` - majors are surveyed and reported, not applied.
    - `Yes - full session incl. majors` - majors handled one at a time.
- On "No", nothing else in this section applies and the cascade behaves as if this section did not exist.
- The update work itself follows
  [.claude/skills/update-npm-packages/SKILL.md](../skills/update-npm-packages/SKILL.md) exactly - READ that file and
  follow it; it is `disable-model-invocation: true`, so it is read as a file rather than invoked through the Skill
  tool. Pass the chosen tier through as that skill's `$ARGUMENTS`. Do not restate its workflow here.
- Scope: every branch in the run, INCLUDING the root base branch that receives no incoming merge (today
  `abstract-javascript-project`). Check the root out for its own npm-update turn even though nothing merges into it.
- Ordering per branch - the update never mixes into the merge:
    - Merge every incoming edge, resolve, get `node --run test` green, and conclude with the merge commit (unchanged
      from the sections below).
    - Let the edge's follow-up commit (see "Post-Merge Review and Follow-Up Commit") land first, so the child's own
      adaptations never end up inside the npm-update commit.
    - THEN run the npm update on that same branch and conclude it as ONE separate commit (past-tense subject, for
      example `Updated npm packages` or `Updated npm packages after merging <base> into <child>`).
    - Only after that does the branch act as a base for its children, so children inherit the bumps through their own
      merge instead of needing a second cascade.
- Verify with the skill's full Finish step on EVERY branch: `node --run housekeeping:update-package-lock-json --
  --no-countdown`, then `HEALTHCHECKS_NO_CACHE=1 node --run test`. The env var is mandatory because recreating
  `node_modules` does not change the git content the checks cache is keyed on
  ([.claude/rules/checks-execution-caching.md](../rules/checks-execution-caching.md)). Expect this to be slow: every
  branch pays that recreate plus an uncached full suite, so a full cascade with updates on is a long, mostly
  unattended run.
- Deviation from the skill's own report rule, stated so it does not read as a contradiction: the skill ends with
  "nothing was staged or committed", but inside this cascade the update IS committed - the next branch cannot be
  checked out with a dirty tree.
- Nothing to update on a branch (the skill reports "already current"): record it, create no commit, continue.
- If the update cannot reach a green `node --run test`, STOP the cascade immediately: stay on that branch, leave the
  working tree and any partial changes exactly as they are, and report the precise state. Never try to discard the
  work - `git reset*` and `git restore --staged*` are denied in [.claude/settings.json](../settings.json), and
  running `git restore` over uncommitted work is forbidden. The merge commit that preceded it stays.

## Read the Tree

- Parse the branching tree from the README at runtime - both the ASCII tree and the "There are some more branches"
  list, which sits INSIDE the same fenced block, below the tree. Never hardcode branch names; the README is the
  single source of truth.
- Derive base -> child edges. Multi-base branches (for example `template-npm-package-with-backend-and-frontend`, which
  builds on two or more bases) get one edge per listed base, merged in the listed order.
- Cross-check the derived branch set against the alphabetical branch list under the same README heading. If the two
  disagree, or the edge set cannot be derived with confidence, stop and say what did not line up - never proceed on a
  partial or guessed edge set, because a silently truncated cascade looks exactly like a complete one.
- Order edges topologically: a branch receives all its incoming merges before being merged into its children.

### Existence - the tree is partly aspirational

The README describes the intended family, not the current one: it deliberately names branches that do not exist yet
(at the time of writing `template-npm-package-for-exports-cli-tui`, `template-webextension`, and
`template-npm-package-with-backend-and-frontend` - an illustration, not a list to trust). A missing branch is normal
and is never an error.

- Classify every README branch AFTER the `git fetch origin` in Prepare, from refs and not from the README:
  `git show-ref --verify --quiet refs/heads/<branch>` for local, `refs/remotes/origin/<branch>` for origin. The three
  outcomes are local, origin-only, and aspirational (neither).
- Origin-only: create the local tracking branch (`git checkout <branch>`) and report that.
- Aspirational: excluded from the run. Never create such a branch, never merge into or from it, and do not offer to
  create it.
- Edge whose child is aspirational: skipped, reported as `child aspirational`.
- Edge whose base is aspirational: skipped, reported as `base missing`.
- NO BRIDGING over a missing intermediate. With `A -> B -> C` where `B` is aspirational, `A` is NOT merged into `C`:
  the tree says `C` builds on `B`, so merging a grandparent in directly is a history decision that belongs to the
  human. Skip both edges and report `C` as `orphaned by B`.
- Multi-base branch with only some bases present: merge the bases that exist, and name the skipped base(s) explicitly
  in the report so a partial update is never presented as a complete one.
- A branch named in `$ARGUMENTS` that is aspirational: stop immediately and say so; never fall back to the full
  cascade.
- A branch that exists locally but has no upstream (never pushed): not an error - skip its ff-only update in Prepare
  and flag it in the report; the closing section's one-liners cover publishing it.
- If classification leaves zero executable edges, say so and stop cleanly - still print the closing section - rather
  than reporting a vacuous success.

## Prepare

- Require a clean working tree (`git status --porcelain` empty); stop immediately otherwise.
- Record the currently checked-out branch and restore it at the end of a successful run.
- `git fetch origin`, then fast-forward-only update each involved branch: `git fetch origin <branch>:<branch>` for
  branches that are not checked out, `git merge --ff-only @{u}` for the checked-out one. If a branch has diverged from
  origin (or has no upstream), do not force anything: continue on the local state and flag it prominently in the
  report so the human reconciles before pushing.
- A branch checked out in another worktree (`git worktree list`) can be neither checked out nor ff-updated here: skip
  its edges and report that; never force.
- This is the run's ONE sync step: the per-edge script invocations below run with `--local`, which skips syncing
  deliberately - mid-cascade branches carry local, unpushed merge commits that the script's sync gate would
  otherwise refuse.

## Merge Each Edge

- First step, per edge: run
  [scripts/branching/merge-source-to-target.sh](../../scripts/branching/merge-source-to-target.sh) -
  `./scripts/branching/merge-source-to-target.sh --source <base> --target <child> --local`. Always `--local`
  (Prepare already synced), never `--push`, and never `--resolve-conflict-with-ai` or its `--allow-ai-*` companions -
  this run resolves conflicts itself, with full context, per "Conflict Resolution" below.
- Script exit 0: the edge is done mechanically - either "Nothing new to merge" (record as already up to date, no
  commit) or a merge commit the script created (clean merge, or manifest-only conflicts it auto-resolved).
- Script exit non-zero with a merge in progress (`git rev-parse -q --verify MERGE_HEAD`): conflicts remain. The
  script already auto-resolved `package.json` / `package-lock.json` where it could - though not when
  `package.json.ts` is itself conflicted; then it touched nothing and the manifest ordering below applies from the
  top. Resolve per the rules below, get `node --run test` green in the working tree, then conclude the merge with a
  single `git commit --no-edit` (the pre-commit hook re-runs the suite).
- Script exit non-zero with NO merge in progress (dirty tree, missing branch, would-overwrite-untracked, a
  local-changes error): do NOT commit - report the script's output verbatim and stop.
- After every merged edge, clean or conflicted, run `node --run test`. The checks-execution cache keeps repeat runs
  cheap only once every conflicted path is staged - while unmerged paths remain, the content hash cannot be computed
  and the cache disables itself (fails open), so mid-resolution runs are always full, uncached runs. Neither husky
  hook replaces this run: `.husky/post-merge` fires only after a conflict-free merge (a conflicted one concluded with
  `git commit` is covered by pre-commit instead), and both are informational for this purpose.
- When npm updates are on, a branch's turn is not finished at its last incoming edge - it ends with the npm-update
  commit described in "NPM Package Updates" above, and only then does it become a base for its children.

## Conflict Resolution

- These cascade rules supersede the global `/cmd-resolve-merge-conflicts` command for the whole run: that command
  forbids wholesale `--ours` resolutions and any staging, which is right for interactive conflict help but wrong
  inside this cascade's documented resolutions - do not let it override the rules below.
- Fork-owned files (listed in
  [docs/template-project/file-conventions.md](../../docs/template-project/file-conventions.md)): keep the child's side
  - `git checkout --ours -- <file>` - then stage that file by name.
- `deleted by us` / `deleted by them` paths: `git checkout --ours` cannot resolve these (the missing side has no
  version), and accepting a deletion needs `git rm`, which is denied. Stop, present both sides, and let the human
  decide - never reach for a plumbing workaround such as `git update-index --force-remove`.
- Manifest files are generated from each other, so resolve them in THIS order - the resolutions and their reasons
  mirror [scripts/branching/merge-source-to-target.sh](../../scripts/branching/merge-source-to-target.sh):
    - `package.json` FIRST: `git checkout --ours -- package.json`. OURS, never `--theirs` - `package.json.ts` derives
      `version` from the adjacent `package.json`, so the base's side would silently regress the child's version;
      every other field is regenerated regardless of side. First because it restores parseable JSON: the generator
      `import()`s `package.json.ts`, and Node reads the adjacent `package.json` to load it, throwing
      `ERR_INVALID_PACKAGE_CONFIG` while conflict markers remain - and the PostToolUse hook
      [regenerate-package-json-after-source-edit.sh](../hooks/PostToolUse/regenerate-package-json-after-source-edit.sh)
      runs that generator on EVERY `package.json.ts` edit, so touching `package.json.ts` before this step makes the
      hook fail (exit 2) on each edit.
    - `package.json.ts`, by hand: keep the child's identity (`name` / `description` / URLs) and dependency blocks,
      take the base's shared structural changes.
    - `package-version.json`, if it conflicts (rare): keep the child's side - the regenerate step below rewrites it
      anyway. Direct edits to it and to `package.json` are denied by the PreToolUse hook
      [block-direct-package-json-edit.sh](../hooks/PreToolUse/block-direct-package-json-edit.sh) - `--ours` plus
      regenerate is the only route for both; do not fight the deny.
    - Regenerate: `./scripts/housekeeping/generate-package-json.sh` (rewrites `package.json` AND
      `package-version.json`; the PostToolUse hook usually already ran it after the `package.json.ts` edit - the
      explicit run is an idempotent confirmation). Regeneration does not clear the unmerged index state - the staging
      step below is still required.
    - `package-lock.json`: run `npm install`.
    - Stage by name: `package.json.ts`, `package.json`, `package-version.json`, `package-lock.json`.
- `CHANGELOG.md`, if it conflicts (unlikely in-repo): it is generated from git history by auto-changelog during
  `npm version`, which runs only in forked functional projects - never on the `abstract-*` / `template-*` branches -
  so a cascade should rarely see it conflict. If it does: keep the child's side and stage it. Never hand-edit it and
  never regenerate it as a resolution - regenerating on the child rewrites the whole file from that branch's own
  history and version. No health check guards its content, so a wrong resolution passes `node --run test` silently.
- `.block-non-keyboard-characters.suppressions.json`: keep BOTH sides' `exemptions` entries and never reorder or
  alphabetize them - the array is order-sensitive, last match wins
  ([.claude/rules/non-keyboard-characters.md](../rules/non-keyboard-characters.md)). Then re-baseline with
  `node --run block-non-keyboard-characters:suppress` (it rewrites only `baseline` and preserves `exemptions`) and
  stage the file by name.
- Shared-in-structure but branch-populated files conflict routinely and want a merge of entries, not a side-pick:
    - Fill-in-slot configs (`knip.config.ts`, `scripts/health-checks/checks/status-of-files.config.ts`,
      `all-is-well.config.ts`): keep BOTH sides - the base's structural changes plus the child's filled-in slots.
    - `.claude/skills/running-the-project/SKILL.md` is branch-aware by design: keep the child's replaced sections,
      take the base's updates outside them.
    - Blocks fenced by `BEGIN: APP-CUSTOMIZATIONS` / `END: APP-CUSTOMIZATIONS`
      ([.claude/rules/comment-tags.md](../rules/comment-tags.md)): resolve per hunk - the child's side inside the
      fences, the base's side outside.
- Ignore lists (`.gitignore`, the `globalIgnores` arrays, the `tsconfig.json` `exclude` list, `.cursorignore` - the
  full set in [.claude/skills/updating-ignore-rules/SKILL.md](../skills/updating-ignore-rules/SKILL.md)): shared
  patterns are owned by the root base branch and flow down by merge, so resolve these toward the BASE side - the
  opposite default from fork-owned files.
- Any other (shared) file: understand both sides' intent (`git log` / `git show` of the relevant commits, the whole
  file, not just the markers); keep both when compatible. On a genuine contradiction, pause and ask the developer with
  the AskUserQuestion tool, presenting both sides with evidence - never guess.
- Stage only individually named resolved files (`git add <file> ...`); bulk staging (`git add -A`, `git add .`, etc.)
  stays denied.
- Before concluding: verify no unmerged paths remain. Stray conflict markers need no manual sweep - the
  `git-conflict-markers` check inside `node --run test` already asserts that.

## Tests and Fix-Forward

- Every `git checkout` in the cascade triggers `.husky/post-checkout`, whose four checks are warn-only and
  informational - nothing there is a failure to fix. Its npm-install-status nudge is the signal for the next bullet.
  It also fires on path-limited checkouts, so `git checkout --ours -- package.json` mid-resolution prints red
  out-of-sync noise - equally informational, resolved by the regenerate step.
- `.husky/post-commit` prints `revisit` reminders after every commit the cascade creates - recurring maintenance
  nudges, not action items for this run.
- Branches differ in dependencies, but `node_modules/` carries over across checkouts: when checks fail only because
  the installed packages do not match the current branch's manifest (the npm-install check says to run npm install,
  or a dependency's binary is missing), run `npm ci` and rerun - that is an environment fix, not a commit.
- Failures a merge commonly introduces, and where each fix lives:
    - `claude-settings-sort`: a merged `.claude/settings.json` comes out unsorted or with duplicates - run
      `node --run claude-settings-sort:fix`.
    - `eslint:markdown`: a child doc kept via `--ours` links to a file the base moved or renamed - re-point the link.
    - `knip`: a file merged down from the base counts as unused on the child (entry points differ per branch) - the
      fix belongs in `knip.config.ts` `entry` / `ignore`, not in deleting the file.
    - `status-of-files`: branch-populated expectations (a listed file missing or writable) - remediate with
      `./scripts/health-checks/checks/ensure-status-of-files.ts`.
- On a `node --run test` failure: diagnose and fix in the working tree, rerun - up to 10 attempts per edge.
- Commit only once green. Test-failure fixes land inside the edge's single follow-up commit (see "Post-Merge Review
  and Follow-Up Commit"); on a conflicted edge, fixes found before concluding the merge fold into the
  merge-concluding commit instead. Never amend.
- Still failing after 10 attempts: stop the cascade. Leave the merge commit (or the in-progress merge) intact and the
  fix attempts uncommitted, stay on that branch, and report the exact state left behind. Also report - never run - the
  escape hatch `./scripts/branching/find-safe-template-merge-commit.sh --base <child> --source <base>`, which finds
  the newest `<base>` commit that merges cleanly and passes on `<child>`; its header documents that it uses local refs
  only, disables hooks for its probe merges, and runs `git clean -fd` during cleanup.

## Post-Merge Review and Follow-Up Commit

A merge brings the base's content over verbatim, and a green suite proves less than it seems - untested code paths
and prose are not covered. So every merged edge gets a code review on top of its merge commit, and the fixes land as
ONE follow-up commit created by you.

- Review the merged-in changes (`git show -m <merge-commit>`, or `git diff <merge-commit>^1..<merge-commit>` for the
  child-side delta) against this checklist:
    - NPM package versions the merge changed: find the child's OTHER usage sites of each bumped package - code the
      suite does not exercise can break even though `node --run test` is green - and check them against the new
      version's changed behavior.
    - Docs and AI instructions on the child that reference what the merge changed (renamed scripts, moved files, new
      conventions): `AGENTS.md`, `.claude/rules/`, skills, `docs/` - unfixed drift misleads future agent runs and
      raises their error rate.
    - Branch-owned content needing branch-specific adaptation: branch-owned skills (for example
      `.claude/skills/running-the-project/` - what "running the project" means differs per branch), and fork-owned
      docs and checklists per
      [docs/template-project/file-conventions.md](../../docs/template-project/file-conventions.md) (`README.md` /
      `AGENTS.md` wording, `docs/init/CUSTOMIZE/` style checklists, branch-specific docs).
- Apply the fixes, keep `node --run test` green, and conclude them as ONE follow-up commit per edge, created by you
  (past-tense subject, for example `Adapted <child> after merging <base>`), then continue to the next edge - no
  pause; the human reviews every commit before pushing. Test-failure fixes from "Tests and Fix-Forward" fold into
  this same commit.
- The merge also brings the base's `docs/specs/todo/TODO-for-<base>.md` into the child. That accumulation is intended:
  the suffix naming keeps the files distinct per
  [docs/template-project/file-conventions.md](../../docs/template-project/file-conventions.md), so never delete an
  ancestor's TODO file as a stale leftover.
- If nothing needs fixing for an edge, say so in the report and continue - no commit.

## Verify

- Per executed edge: `git log --oneline <child>..<base>` must be empty - the base is fully contained in the child.
- `git status --porcelain` must be empty.
- The checked-out branch is the one recorded in Prepare (not applicable after a deliberate mid-cascade stop).

## Refresh Flat Mirrors

A cascade that advances a `template-*` branch leaves that branch's `<branch>-flat` mirror stale, so after Verify,
always run:

```sh
node --run template:flatten-branches
```

It refreshes every EXISTING `template-*` mirror and is a no-op while none exist. Never pass `--create-branches`:
creating a mirror stays the human's decision (via `/cmd-generate-flat-branches`). Skip this step after a
mid-cascade stop - the wrapper requires a clean tree, which a stop deliberately leaves dirty.

## Resuming After a Stop

Every stop path above deliberately leaves the working tree dirty, and sometimes a merge in progress, so nothing is
lost. Prepare then refuses to start the next run - that interlock is intended, not a bug. Say so in the stop report.

- A stop ends the turn, and the Stop hooks then run repo-wide fixers (the non-keyboard-character fixer, `eslint --fix`
  over changed files - unmerged ones included - and the settings sorter), so files may differ slightly from the moment
  of the stop; account for that in the stop report.
- The human resolves the dirty state, commits it, and pushes it. The cascade does not resume before that.
- Never discard the work yourself - not `git merge --abort`, not `git restore`, not any equivalent.
  `git merge --abort` is absent from the deny list but destroys uncommitted work, so it stays the human's call like
  every other git-state decision here.
- After the human has committed and pushed, re-run the command: edges already merged report "already up to date", so
  the cascade resumes rather than redoing work, and `<branch> subtree` narrows it to what is left.

## Rules

- Never push or force-push, never amend, never skip hooks with `--no-verify`, never `git reset`,
  `git restore --staged`, or `git rm`.
- Never merge into or from a branch that the README tree does not name, and never create a branch the README names but
  the repo does not have.
- At most three commits per branch CREATED BY YOU: one merge commit, one follow-up commit (post-merge review
  findings plus test fixes), one npm-update commit. Never fold the npm update into the merge or follow-up commit.
- Use the AskUserQuestion tool whenever a human opinion is needed (judgment-call conflicts, surprising repo state).
- If the run stops mid-cascade, stay on the affected branch and say so instead of restoring the original branch.

## Report

- Per edge: merged / already up to date / skipped - with the reason (aspirational branch, diverged, excluded).
- Conflicts per file and how each was resolved (kept child side / regenerated / merged both intents). Flag `AGENTS.md`
  keep-side resolutions so the human can port shared wording into the child by hand if wanted.
- Branches excluded by classification: aspirational ones, descendants orphaned by a missing intermediate (naming the
  branch that orphaned them), multi-base branches merged from only part of their bases (naming the skipped bases), and
  branches with no upstream.
- Post-merge review findings and the follow-up commit created per edge (or `none needed`).
- NPM update per branch: `not requested`, `skipped (already current)`, or the tier applied with a from->to summary,
  the packages held back and why, and whether the lockfile recreate changed `package-lock.json`.
- Test outcomes, follow-up commits created, local tracking branches created, diverged branches needing attention.
- Flat mirrors: the wrapper's per-mirror verdicts (appended / already up to date), `no mirrors exist`, or
  `skipped (mid-cascade stop)`.
- When the run re-resolved the same identity conflicts a cascade always hits, suggest the human enable, once:
  `git config rerere.enabled true` and `git config merge.conflictstyle zdiff3`. Never run them - repo-wide git config
  is the human's call. Include the caveat that with rerere enabled, git auto-stages remembered resolutions on future
  merges, so later runs must review what rerere staged before concluding - it bypasses the stage-by-name discipline.
- Finish with the closing section below.

## Closing: Push Status and Pushing

Nothing was pushed - reviewing and publishing stays the human's step. Per branch, review with
`git log origin/<branch>..<branch>`. Then end the response with BOTH fenced blocks below, VERBATIM: they are
hard-coded so every run offers the same copy-pasteable pair - do not regenerate, shorten, or adapt them.

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
