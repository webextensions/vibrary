# Source code and tests

Applies to: new project, and template branches that introduce a layout.

The core logic lives in [`./lib/`](../../../lib/) - replace the `templateNpmPackage` stub in
[`./lib/template.js`](../../../lib/template.js) with your package's real API.
[`./index.js`](../../../index.js) is a thin wrapper that re-exports from `lib/`; widen its
re-export as you add modules (consumers can also deep-import them via the `./lib/*` subpath in
`package.json.ts`'s `exports`). Update the sample tests accordingly:
[`./lib/template.test.js`](../../../lib/template.test.js) (the unit, colocated with the source -
kept out of the published tarball by the `"!**/*.test.*"` negation in `files`) and
[`./test/index.test.js`](../../../test/index.test.js) (the public entry). Conventions:
[testing.md](../../../.claude/rules/testing.md). The generic
[`./test/sanity.test.js`](../../../test/sanity.test.js) can stay or be removed.
