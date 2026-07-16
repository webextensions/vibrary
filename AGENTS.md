# AGENTS.md

Guidance for AI coding agents (Claude Code, Cursor, Codex, and others) working in this
repository. This is the agent-facing companion to [docs/README.md](docs/README.md):
that index is the human entry point to the development workflows, this file is the canonical agent
guide. It is plain markdown so every tool can read it directly. Claude Code reads it through the
`@AGENTS.md` import in [CLAUDE.md](CLAUDE.md); Cursor and Codex read this file natively at the
repo root.

This file is fork-owned (template merges keep your side), so it stays thin: the "Project overview"
section below is this branch's own content, and everything after it is one-line guardrails linking
to the shared homes that keep receiving template updates.

## Project overview

`abstract-npm-package` - the shared base branch for the npm-package template branches
(`template-npm-package-for-exports`, `-for-exports-cli`, `-for-exports-cli-tui`,
`template-npm-package-for-react`). It layers the npm publishing baseline on top of
`abstract-javascript-project`: a publishable manifest (`main` / `exports` / `files` /
`publishConfig` in `package.json.ts`), a `publint` health check, a `prepublishOnly` test gate, an
`.npmignore` backstop, and a placeholder entry point (`index.js` + `test/index.test.js`) that the
template branches replace wholesale. Fork projects from a `template-npm-package-*` branch, not
from this abstract branch. Vision, branching tree, and the fork/merge model:
[docs/template-project/README.md](docs/template-project/README.md).

## Commands

- `node --run test` - run the full check suite before every commit.
- `node --run test:optimize-for-change` - change-aware suite for fast local iteration (git hooks
  always run the full `test`).
- `node --run housekeeping:generate-package-json` - regenerate `package.json` from
  `package.json.ts`.

The full command list and the health-check suite behind `test` are indexed in
[docs/README.md](docs/README.md).

## Source of truth: package.json.ts

- Never hand-edit `package.json` or `package-version.json` - edit
  [package.json.ts](package.json.ts), then regenerate with
  `node --run housekeeping:generate-package-json`.
- The `version` is owned by npm (`npm version`) - never hand-edit it (derivation detail: the
  header comment in `package.json.ts`).

Details: [.claude/rules/git-workflow.md](.claude/rules/git-workflow.md).

## Conventions

- ASCII punctuation only, in every file including markdown and commit messages:
  [.claude/rules/non-keyboard-characters.md](.claude/rules/non-keyboard-characters.md).
- Code style (ESM, 4-space indentation, semicolons, unix line endings, bash shebang):
  [.claude/rules/code-style.md](.claude/rules/code-style.md).
- Commits: clear, ASCII subjects - they become the `CHANGELOG.md` entries; never hand-edit
  `CHANGELOG.md`: [.claude/rules/git-workflow.md](.claude/rules/git-workflow.md).
- Fork-owned vs shared files (which files conflict on template merges - keep your side):
  [docs/template-project/file-conventions.md](docs/template-project/file-conventions.md).
- Tests: Vitest `*.test.js` files, colocated next to the source or grouped under [test/](test/):
  [.claude/rules/testing.md](.claude/rules/testing.md).

## Git and safety

- A human owns git state: never stage, unstage, commit, push, force-push, skip hooks with
  `--no-verify`, or run destructive `rm -rf` (`git mv` for intentional renames/moves is the one
  index-touching exception - the human still reviews it before commit).
- Details and enforcement: [.claude/rules/git-workflow.md](.claude/rules/git-workflow.md) and the
  deny list in [.claude/settings.json](.claude/settings.json).

## Template-sync workflow

- Common content flows in by merging the `template` branch: `node --run template:merge-to-main`;
  fork-owned files (e.g. `package.json.ts` identity) are expected to conflict - keep your side.
  Full workflow: [docs/template-project/template-sync.md](docs/template-project/template-sync.md).
