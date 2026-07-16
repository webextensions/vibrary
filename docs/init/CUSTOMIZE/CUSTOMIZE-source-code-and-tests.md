# Source code and tests

Applies to: new project, and template branches that introduce a layout.

This branch ships only a placeholder entry point: [`./index.js`](../../../index.js) (one named
export inside `Begin`/`End` fill-in markers, referenced by `main`/`exports` in `package.json.ts`)
and its test [`./test/index.test.js`](../../../test/index.test.js). Replace both wholesale with
your own layout and real tests (the template branches, e.g. `template-npm-package-for-exports`,
demonstrate concrete layouts; conventions: [testing.md](../../../.claude/rules/testing.md)). The
generic [`./test/sanity.test.js`](../../../test/sanity.test.js) can stay or be removed.
