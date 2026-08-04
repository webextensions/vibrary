# CLAUDE.md

@AGENTS.md

## Claude Code

The project-wide agent guide is [AGENTS.md](AGENTS.md) (imported above). This section covers
Claude-Code-specific mechanics only. See [docs/README.md](docs/README.md) for the documentation
index (commands are documented as comments in `package.json.ts`, health checks in
`all-is-well.ts`).

- **Generated files:** hooks block direct edits to the generated `package.json` /
  `package-version.json` and regenerate them after `package.json.ts` edits - always edit
  `package.json.ts` (the hook headers in [.claude/hooks/](.claude/hooks/) document the mechanics).
- **Stop hooks:** the scripts in [.claude/hooks/Stop/](.claude/hooks/Stop/) auto-run fixers (plus a
  read-only type check) at the end of each turn - each script's header documents what and when.
  Still produce clean output in the first place; do not rely on the fixers.
- **Permissions:** the deny list in [.claude/settings.json](.claude/settings.json) (authoritative)
  blocks index-mutating git ops and destructive deletes. The human owns commits and pushes.
- **Rules:** path/topic rules live in [.claude/rules/](.claude/rules/) and load into every session
  (e.g. `non-keyboard-characters.md`).

## CodeGraph

In repositories indexed by CodeGraph (the `.codegraph/` directory holds an index, not just its
committed `.gitignore`), reach for it BEFORE grep/find or reading files when you need to understand
or locate code. The directory's mere existence does not count: it is committed with only a
`.gitignore`, so it is present even in clones that were never indexed - actual index contents (e.g.
the SQLite `codegraph.db`) are the real signal.

- **MCP tools** (when available): `codegraph_explore` answers most code questions in one call - the
  relevant symbols' verbatim source plus the call paths between them. `codegraph_node` returns one
  symbol's source + callers, or reads a whole file with line numbers. If the tools are listed but
  deferred, load them by name via tool search.
- **Shell** (always works): `codegraph explore "<symbol names or question>"` and
  `codegraph node <symbol-or-file>` print the same output.

If `.codegraph/` is absent or holds only its `.gitignore`, skip CodeGraph entirely - indexing is
the user's decision.
