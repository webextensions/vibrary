# Project Agent Configuration

This directory contains project-scoped guidance for coding agents working in this repository.

## How To Use

- Root `AGENTS.md` is the compact always-on project guide.
- `rules/` contains topical coding standards.
- `playbooks/` contains repeatable workflows for common requests (Markdown files named `cmd-<slug>.md`, using the same `cmd-` basename pattern as other instruction-command trees in this repository).
- `agents/` contains role-specific checklists for when a task needs a review, test, or exploration mindset.

These files are intentionally project-scoped. They do not replace the agent runtime's built-in behavior; they provide the local conventions needed to work effectively in this repository.

On this base template branch, `rules/`, `playbooks/`, and `agents/` start as pointer stubs - the
project-scoped canonical content lives under `.claude/` and is mirrored on demand with the
user-global `cmd-sync-ai-instructions-*` commands.

## Scope Notes

- Keep changes within this repository unless the user explicitly asks otherwise.
- Prefer `rg` for exploration.
- Verify `node --version` satisfies `.nvmrc` before running project Node commands; if not, fix the
  active Node.js environment, verify again, then continue.
- Keep generated code consistent with nearby precedent.
