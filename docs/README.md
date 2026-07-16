# Documentation Index

The map of this repository's documentation. The docs are kept as pointers to self-documenting
sources of truth rather than copies of them - follow a pointer to the file that owns the fact.
[AGENTS.md](../AGENTS.md) is the agent-facing companion; [CLAUDE.md](../CLAUDE.md) imports
`AGENTS.md` via `@AGENTS.md` so Claude Code reads the same instructions.

## Development workflows

- **Day-to-day commands** - every command runs as `node --run <script>`; the `scripts` block in
  [package.json.ts](../package.json.ts) is the source of truth for the command list, and each
  script is documented by the comment above it.
- [development/health-checks.md](./development/health-checks.md) - the check suite behind
  `node --run test`: orchestrator, flags, configuration, and the git hooks that run it.
- [development/releasing.md](./development/releasing.md) - the `npm version` release flow and
  changelog generation.
- [recipes/](./recipes/) - step-by-step how-tos for occasional multi-step tasks.
- [setup/](./setup/) - one-time setup guides.
- [specs/](./specs/) - pre-implementation design docs for non-trivial changes.

## Template family

- [template-project/README.md](./template-project/README.md) - vision and the git branching tree
  of the template family.
- [template-project/file-conventions.md](./template-project/file-conventions.md) - which files are
  fork-owned and which are shared content.
- [template-project/template-sync.md](./template-project/template-sync.md) - pulling template
  updates into a forked project.
- [init/README.md](./init/README.md) - one-time steps after forking a new branch or project
  (the customization checklist under [init/CUSTOMIZE/](./init/CUSTOMIZE/)).

## Sources of truth (self-documenting)

- [package.json.ts](../package.json.ts) - dependencies and command scripts; generates
  `package.json` (never hand-edit the generated file).
- [scripts/health-checks/all-is-well.ts](../scripts/health-checks/all-is-well.ts) - the
  `healthChecks` array: check list, launch order, and per-check documentation.
- [.husky/](../.husky/) - the git hooks; each script's header comment documents when it runs and
  whether it blocks.

## Conventions and rationale

- [.claude/rules/](../.claude/rules/) - topical convention deep-dives (error handling, testing,
  git workflow, first principles, ...).
- [because/](../because/) - why-entries for hacks, workarounds, and non-obvious decisions, so
  future readers do not "fix" them back.
