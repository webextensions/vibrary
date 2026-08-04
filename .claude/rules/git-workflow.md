---
description: Git workflow, scripts, and project management conventions
---

# Git and Workflow Conventions

## Package Management
- `package.json.ts` is the **source of truth** for dependencies - never edit `package.json` directly
- After editing `package.json.ts`, run `node --run housekeeping:generate-package-json` to regenerate `package.json`
- Use `node --run housekeeping:update-and-generate-package-json` to update npm dependencies in `package.json.ts`
  (regenerates `package.json` from `package.json.ts`)

## Git Hooks (Husky)
- **Pre-commit** and **pre-push**: run the full health-check suite (`node --run test`); the
  checks-execution cache makes repeat runs against the same git content cheap, even across a commit
  (see [checks-execution-caching.md](./checks-execution-caching.md))
- `node --run test:optimize-for-change` is for fast local iteration only - the git hooks always run the full `test`
- Never skip hooks with `--no-verify` unless explicitly asked

## Template-Branch Workflow
- This repository is a family of template branches (see
  [docs/template-project/README.md](../../docs/template-project/README.md)); common content flows from base
  branches into template branches and forks via git merges
- Forked projects pull template updates with `node --run template:merge-to-main` (auto-resolves
  `package.json` / `package-lock.json`); fork-specific identity in `package.json.ts` is expected to conflict - keep
  the fork's side

## Refactoring File Moves
- When files need to be moved during refactoring, prefer terminal-based move commands such as `git mv` instead of
  rewriting files from scratch, then update import paths and other path references

## Commit Messages

- Add a body only when the change is non-trivial and the reason matters.
- Do not end the subject with a period.
- Do not use Conventional Commits unless the user explicitly asks.
- Keep subject lines concise, preferably under 72 characters.
- Match recent project history (subjects become CHANGELOG.md entries via auto-changelog).
- Past-tense descriptive style: `Added...`, `Improved...`, `Refactored...`, `Fixed...`, `Updated...`, `Removed...`,
  `Renamed...`, `Now using...`.
- Prefix with area when useful (for example `Refactor: Renamed...`).

## Safety

- Never amend previous commits unless explicitly asked.
- Never commit `.env`, credentials, or secrets.
- Never force-push unless explicitly asked.
- Never stage or unstage changes (`git add`, `git restore --staged`, `git reset`, etc.); the developer handles the
  index after manual review. (Two exceptions: `git mv` for intentional renames/moves, and `git add <named file>` to
  stage individually resolved files when concluding a merge - bulk staging such as `git add -A` / `git add .` stays
  denied.)

## Non-Obvious Decisions
- Document hacks, workarounds, and non-obvious decisions in the `docs/because/` directory
- Each file explains why a particular approach was taken

## Health Checks
- Run `node --run test` before pushing - it executes all checks concurrently
- For isolated failures, use individual commands (see `node --run eslint`, `node --run vitest`, etc.)
