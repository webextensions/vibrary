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
