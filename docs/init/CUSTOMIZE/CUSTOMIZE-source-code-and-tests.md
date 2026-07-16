# Source code and tests

Applies to: new project, and template branches that introduce a layout.

The core logic lives in [`./lib/`](../../../lib/) - replace the `templateNpmPackage` stub in
[`./lib/template.js`](../../../lib/template.js) with your package's real API.
[`./index.js`](../../../index.js) is a thin wrapper that re-exports from `lib/`; widen its
re-export as you add modules (consumers can also deep-import them via the `./lib/*` subpath in
`package.json.ts`'s `exports`). [`./cli.js`](../../../cli.js) is the CLI wrapper - keep it thin
(argument parsing only, delegating to the library functions from `index.js`) and rework its
arguments/options for your real API; remove it (plus the `bin` field and the `commander`
dependency) if your package has no CLI. Update the sample tests accordingly:
[`./lib/template.test.js`](../../../lib/template.test.js) (the unit, colocated with the source -
kept out of the published tarball by the `"!**/*.test.*"` negation in `files`),
[`./test/index.test.js`](../../../test/index.test.js) (the public entry) and
[`./test/cli.test.js`](../../../test/cli.test.js) (spawns the CLI and asserts its
output/exit code). Conventions: [testing.md](../../../.claude/rules/testing.md). The generic
[`./test/sanity.test.js`](../../../test/sanity.test.js) can stay or be removed.
