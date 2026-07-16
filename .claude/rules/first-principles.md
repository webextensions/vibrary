# First Principles - Decision Charter

The root rationales behind this repository's conventions: the "why" layer from which the topical rules in this
directory derive. When a situation has no specific rule and no clear precedent, derive the answer from the principles
below instead of guessing or importing habits from other projects.

## Precedence

Resolve any decision in this order:

- A specific rule file in [.claude/rules/](./) or the agent guide ([AGENTS.md](../../AGENTS.md)) - when one covers the
  case, it wins over everything below.
- Nearby code precedent - patterns already used in the same or neighboring files of this repo.
- These first principles - pick the option the bullets below favor.
- Ask the human - when the principles still leave a genuine fork, or the action is destructive or outward-facing.

When the principles themselves conflict:

- Mergeability across template branches and human-owned git state trump local style preferences.
- Determinism and correctness trump convenience and speed.

## When adding, moving, or renaming files

- **Mergeability above all** - this repository is a family of template branches; forks pull shared updates by merging
  template branches into their `main` ([docs/template-project/README.md](../../docs/template-project/README.md)).
  Judge every layout, naming, and content choice by whether it will merge cleanly down the whole family. Prefer
  additions over edits to shared files, and small focused files over growing monoliths.
- **Fork-owned files are edited in place** - which files are fork-owned (expected to conflict on
  template merges; keep your side) vs shared:
  [docs/template-project/file-conventions.md](../../docs/template-project/file-conventions.md).
- **Generated files are outputs, never sources** - `package.json`, `package-version.json`, and `CHANGELOG.md` are
  generated; their sources are [package.json.ts](../../package.json.ts), npm, and git history
  ([git-workflow.md](./git-workflow.md)). More generally: when content is derivable from a source of truth, generate
  it and guard the sync with a health check rather than maintaining two copies by hand.
- **No legacy traces** - remove old names, stubs, and dead content completely in the same change; git history is the
  archive. Docs describe the current state only.

## When writing code

- **Match nearby precedent first** - read how the neighboring files solve the same problem before inventing a new
  shape; new code follows the documented conventions even where old code does not.
- **One style baseline** - ESM, 4-space indentation, semicolons, unix line endings, bash shebang
  ([code-style.md](./code-style.md)).
- **Explicit errors over silent failures** - application-style async code returns `[error, result]` tuples and never
  throws; errors carry a message, a `cause`, and an `UPPER_CASE` code ([error-handling.md](./error-handling.md)).
- **Names that explain themselves** - naming and function-shape patterns:
  [function-patterns.md](./function-patterns.md).
- **Alphabetical when order has no meaning** - sorted lists are deterministic, easy to scan, and minimize merge
  conflicts across the branch family ([alphabetical-sorting.md](./alphabetical-sorting.md)).
- **ASCII punctuation everywhere** - typographic characters slip past visual review and fail the health check; write
  keyboard characters in the first place ([non-keyboard-characters.md](./non-keyboard-characters.md)).
- **Tests mirror production style** - see [testing.md](./testing.md).

## When building tooling, scripts, and checks

- **Automation is a safety net, not a crutch** - hooks and fixers (ASCII fixer, ESLint auto-fix, permission sorter)
  exist to catch slip-ups, not to license sloppy output. Produce clean content in the first place; design new tooling
  so the happy path needs no fixer.
- **Optimizations fail open** - a cache or shortcut that cannot prove it is safe must disable itself and let the full
  path run; only full passes are ever cached ([checks-execution-caching.md](./checks-execution-caching.md)).
- **Determinism over time-dependence** - key caches and comparisons on content hashes (git tree objects, not stashes
  or timestamps) and feed them sorted inputs, so equal content gives equal results across runs, branches, and
  machines ([checks-execution-caching.md](./checks-execution-caching.md)).
- **Failures are loud and actionable** - every health check carries an `errorMsg` that tells the user exactly what to
  run next; never swallow a failure to keep output tidy.
- **Layered fail-fast gates** - check the environment before the source, syntax before lint, lint before tests; run
  concurrently by default and keep a `--sequentially` escape hatch for debugging
  ([docs/development/health-checks.md](../../docs/development/health-checks.md)).
- **Optional niceties degrade gracefully** - decoration-only dependencies (e.g. chalk and boxen in
  [utils/logger.ts](../../utils/logger.ts)) are imported dynamically and skipped when absent; nice-to-haves must not
  become hard dependencies.
- **Claude Code hooks are scripts, not inline shell** - see [claude-code-hooks.md](./claude-code-hooks.md).

## When touching git, versions, or releases

- **The human owns git state** - never stage, unstage, commit, or push; `git mv` for intentional renames is the only
  index-touching exception, and the human still reviews it. Enforced by the deny list in
  [.claude/settings.json](../settings.json) ([git-workflow.md](./git-workflow.md)).
- **Never bypass checks** - no `--no-verify`, and no lint or check suppressions added just to get past a failure; fix
  the cause or surface the blocker.
- Versioning, commit-message, and template-merge conventions live in [git-workflow.md](./git-workflow.md) and
  [docs/template-project/template-sync.md](../../docs/template-project/template-sync.md).

## When writing docs and AI instructions

- **Verify standards against the repo, never assume industry defaults** - before asserting a project convention in any
  generated doc (constitution, spec, README, agent guide), confirm it against the actual source: read
  [tsconfig.json](../../tsconfig.json) (this repo is `strict: false`, JS-first), [eslint.config.js](../../eslint.config.js)
  (ESLint only, no Prettier), [package.json.ts](../../package.json.ts), and the rule files here. Industry-standard
  boilerplate that contradicts the repo is a bug, not a default.
- **One home per fact** - document a convention once and link to it from everywhere else; when another instruction
  file already covers a point, do not restate it.
- **Short beats complete** - a short file the model follows beats a complete one it skims; record constraints and
  exceptions, not tutorials, and omit anything a capable agent does unprompted.
- **Non-obvious decisions get a why-entry** - hacks, workarounds, and surprising choices are documented in
  [because/](../../because/) so future readers do not "fix" them back.

## When choosing or updating dependencies

- **Dependencies belong in the source of truth** - see [git-workflow.md](./git-workflow.md) (where they live) and
  [alphabetical-sorting.md](./alphabetical-sorting.md) (how they are ordered).
- **Prefer the documented scripts** - run tools through the `package.json` scripts (`node --run ...`) rather than
  invoking binaries directly; the scripts encode the project's intended flags and order
  ([package.json.ts](../../package.json.ts)).
