# AI and agent documentation

Applies to: both flows.

- [`AGENTS.md`](../../../AGENTS.md) is the canonical agent guide, read natively by Cursor, Codex,
  and other agentic tools (it follows the [agents.md](https://agents.md/) standard). It is fork-owned
  and deliberately thin: a fork-owned "Project overview" at the top, then one-line guardrails linking
  to the shared convention homes (which keep flowing in by template merge). Update the project
  overview and add any fork-specific conventions there; keep the shared facts as links instead of
  restating them, and do not add `@import` lines (non-Claude tools cannot expand them).
- [`CLAUDE.md`](../../../CLAUDE.md) is a thin file: it imports `AGENTS.md` via `@AGENTS.md` plus a Claude-Code-only
  section (hooks, permissions). Keep that structure. It is optional for forks that do not use Claude Code.
  Template merges may update this file.
- Cursor and Codex need no extra files (they read `AGENTS.md` directly). If you want path-scoped Cursor
  rules, you may add [`.cursor/rules/*.mdc`](https://cursor.com/docs/rules) alongside `AGENTS.md`.
- Review [`.claude/settings.json`](../../../.claude/settings.json) `permissions.allow` / `deny` for your workflow.
- Keep [`.claude/rules/non-keyboard-characters.md`](../../../.claude/rules/non-keyboard-characters.md) if you keep the
  `non-keyboard-characters` health check (recommended).
- Adjust [`revisit.json`](../../../revisit.json) maintenance reminders (npm audit, outdated, character scan) to match
  your team's schedule.
