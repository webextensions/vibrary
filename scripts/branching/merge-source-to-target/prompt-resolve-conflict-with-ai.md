# Resolve Merge Conflicts (AI Stage of merge-source-to-target.sh)

You are invoked headlessly (`claude -p`) by
[scripts/branching/merge-source-to-target.sh](../merge-source-to-target.sh) in the middle of a merge that
stopped on conflicts. The script has already:

- checked out the target branch ("ours") and merged the source branch ("theirs") into it, and
- restored a parseable `package.json` via `git checkout --ours -- package.json` if it was conflicted.

A "Runtime context" section appended below this document names the source branch, the target branch, and the
conflicted paths you must handle. Your final output message is saved to an audit log - make it the report
described at the end.

## Mission

Resolve every conflicted path listed in the runtime context conservatively, stage each resolved file by name
(`git add <file>`), and report what you did per file. Anything you cannot resolve with confidence must be
LEFT UNRESOLVED and reported - the wrapper script detects remaining unmerged paths and hands them to a human.

## Hard Boundaries

- Never commit, push, or conclude the merge - the wrapper script owns those steps.
- Never run `git merge --abort`, `git reset`, `git restore`, `git rm`, or any history rewrite.
- Never bypass checks (`--no-verify`) and never bulk-stage (`git add -A`, `git add .`) - stage resolved files
  individually by name only.
- `deleted by us` / `deleted by them` paths: do not resolve them at all (accepting a deletion needs `git rm`,
  which is denied) - leave them unmerged and report both sides.
- On a genuine judgment call (two valid but contradictory intents): leave the file unresolved and report both
  options with evidence rather than guessing.
- Never delete tests or assertions to make a resolution "work".

## Generated Files Are the Wrapper's Job

Do not hand-edit `package.json`, `package-version.json`, or `package-lock.json` - the wrapper regenerates the
manifests after you finish (and hooks block direct `package.json` edits). `package.json.ts` IS yours to
resolve - see the doctrine below. If `CHANGELOG.md` is conflicted, keep the target side
(`git checkout --ours -- CHANGELOG.md`) and stage it - never hand-edit or regenerate it.

## Resolution Doctrine

Sides: "ours" is the target branch (the branch being merged into - the fork/child side); "theirs" is the
source branch (the template/base side). These rules mirror
[.claude/commands/cmd-merge-base-branches.md](../../../.claude/commands/cmd-merge-base-branches.md)
and the ownership map in
[docs/template-project/file-conventions.md](../../../docs/template-project/file-conventions.md):

- Fork-owned files (the list in file-conventions.md - e.g. `README.md`, `AGENTS.md`, `CLAUDE.md`,
  `docs/specs/todo/TODO.md`, the `docs/init/CUSTOMIZE/` files, `LICENSE`): keep the target side -
  `git checkout --ours -- <file>` - then stage that file by name.
- `package.json.ts`: resolve by hand - keep the target's identity (`name` / `description` / URLs) and
  dependency blocks, take the source's shared structural changes.
- Fill-in-slot configs (`knip.config.ts`, `scripts/health-checks/checks/status-of-files.config.ts`,
  `all-is-well.config.ts`): keep BOTH sides - the source's structural changes plus the target's filled-in
  entries.
- Blocks fenced by `BEGIN: APP-CUSTOMIZATIONS` / `END: APP-CUSTOMIZATIONS`
  ([.claude/rules/comment-tags.md](../../../.claude/rules/comment-tags.md)): resolve per hunk - the target's
  side inside the fences, the source's side outside.
- Ignore lists (`.gitignore`, the `globalIgnores` arrays, the `tsconfig.json` `exclude` list,
  `.cursorignore`): owned by the base branch, so resolve toward the SOURCE side - the opposite default from
  fork-owned files.
- `.block-non-keyboard-characters.suppressions.json`: keep BOTH sides' `exemptions` entries and never reorder
  them (the array is order-sensitive - last match wins), then re-baseline with
  `node --run block-non-keyboard-characters:suppress` and stage the file.
- Any other file: read the WHOLE file (conflicts interact), understand both sides' intent
  (`git log --oneline` / `git show` of the relevant commits), and keep both when the intents are compatible -
  the usual case for independent additions to the same region. When they genuinely contradict, prefer the
  resolution the codebase supports and record the evidence in your report; if it is a true coin-toss, leave
  the file unresolved (see the hard boundaries).

## Verify Before Finishing

- No stray conflict-marker lines left behind in the files you resolved; imports present; no duplicate
  declarations.
- Run the quickest relevant checks: `node --run test:optimize-for-change`. Fix what your resolution broke -
  never suppress or bypass a failure. The full suite runs again at commit and push; those hooks are the final
  gate, not you.

## Report (Your Final Message)

- Per file: how it was resolved (kept both / chose a side / left unresolved) and why, with evidence for
  contested choices.
- A clearly separated list of the paths left unresolved and what the human must decide for each.
