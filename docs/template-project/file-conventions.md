# File Conventions for the Template Branches

How files are owned and shared across the template-branch family (see [README.md](./README.md) in
this folder for the vision and the git branching tree). Every file is a plain regular file - no
symlinks, no per-branch copies. Shared improvements flow down the family by merging the base /
template branch in; the few fork-owned files below are expected to conflict on such merges, and the
resolution rule is simple: keep your side, then port any upstream improvements you want by hand.

## Fork-owned files (expected to conflict on merge - keep your side)

These carry the branch's or project's own identity/content, and every branch or fork edits them in
place:

- `README.md` - the project front page (title, badges, intro).
- `AGENTS.md` - the agent guide's project overview and fork-specific conventions.
- `CLAUDE.md` - usually inherited unchanged, but forks may add Claude-Code-specific notes.
- [../specs/todo/TODO.md](../specs/todo/TODO.md) - the fork's/project's own task list (the base
  branch ships a generic skeleton).
- [../init/CUSTOMIZE/](../init/CUSTOMIZE/) - the customization checklist, one `CUSTOMIZE-*.md`
  file per step behind a `README.md` index; each branch edits the steps in place and adds
  `CUSTOMIZE-*.md` siblings for the steps its layer introduces.
- `package.json.ts` - shared in structure, but `name` / `description` / URLs and the dependency
  blocks are fork-specific. See [template-sync.md](./template-sync.md).
- `LICENSE` - the copyright holder line. It rarely changes upstream, so conflicts stay rare.

## Branch backlogs within this repository

Both live under [../specs/todo/](../specs/todo/):

- `TODO.md` - each fork's/project's own task list (see above).
- `TODO-for-<branch>.md` (e.g. `TODO-for-abstract-javascript-project.md`) - a template/abstract
  branch's own backlog inside this repository; the suffix naming keeps the files distinct across
  branches, so they never conflict.

## Shared files (evolve once, flow by merge)

Everything else is shared content that should evolve once on the base branch and flow to every
fork via merge - do not fork-customize these:

- `CONTRIBUTING.md`, `SECURITY.md`
- `docs/` (the `README.md` index and its topic files), including this `docs/template-project/` folder
- Configs (`eslint.config.js`, `tsconfig.json`, `vitest.config.js`, `knip.config.ts`, dotfiles),
  `scripts/`, `test/`, `.claude/`, `.husky/`, `.github/`, `.vscode/`

## Shared in structure, branch-populated in content

A few shared files are deliberate fill-in slots: their structure evolves on the base branch, but each branch fills in
its own entries, so template merges routinely conflict on them - keep both sides (the base's structural changes plus
your entries):

- `knip.config.ts`, `scripts/health-checks/checks/status-of-files.config.ts`, `all-is-well.config.ts`
- `.claude/skills/running-the-project/SKILL.md` - branch-aware by design; a branch replaces the sections the file
  itself marks for replacement and keeps them on merges
- Blocks fenced by `BEGIN: APP-CUSTOMIZATIONS` / `END: APP-CUSTOMIZATIONS` inside any otherwise-shared file
  ([.claude/rules/comment-tags.md](../../.claude/rules/comment-tags.md)): keep your side inside the fences, take the
  template's side outside

Two special cases resolve differently:

- Ignore lists (`.gitignore`, the `globalIgnores` arrays, the `tsconfig.json` `exclude` list, `.cursorignore` - the
  full set in [.claude/skills/updating-ignore-rules/SKILL.md](../../.claude/skills/updating-ignore-rules/SKILL.md))
  are owned by the root base branch: conflicts resolve toward the base side.
- `CHANGELOG.md` is generated from each branch's own git history (by auto-changelog during `npm version`, which runs
  only in forked functional projects): on conflict keep your side; never hand-edit it - the next `npm version`
  regenerates it.
