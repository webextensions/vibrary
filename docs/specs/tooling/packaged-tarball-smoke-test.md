# Packaged-tarball smoke test

`node --run smoke-test` ([scripts/smoke-test-package.js](../../scripts/smoke-test-package.js)) automates the packaging
smoke test that used to be a manual checklist in CLAUDE.md: `npm pack` the tarball, install it with `--omit=dev` into
a scratch consumer folder, start the installed server against a scratch vibrary folder, and hit `/api/files` and
`/api/files-summary`. It exits nonzero on any failure and always tears down the server and scratch folders.

## Why

The project's one recurring packaging trap is a runtime import outside the shipped `files` list, or a
backend-reachable package left in devDependencies: everything keeps working from the repo (the full tree and
node_modules are present) while the installed package is broken - this has happened once already. A failure mode that
has actually occurred deserves a script, not a checklist.

## Design choices

- The consumer folder lives OUTSIDE the repo (under the OS tmpdir), so Node's resolution walking up the tree cannot
  borrow the repo's own `node_modules` and mask a missing dependency.
- `/api/files-summary` is asserted as well as `/api/files` because the summary parses files through
  `shared/vibraryXmlCore.js` - the exact runtime import that broke in the past. The assertion checks the fixture
  entry's title and tally, proving the core actually parsed.
- The internal `npm pack` runs with `--ignore-scripts` so prepack's check suite does not re-run - and does not recurse,
  because the smoke test itself is the final step of `prepack`. The tarball therefore ships the CURRENT `dist/`, which
  prepack has just built by that point; standalone runs fail fast with a clear message when `dist/` is missing.
- The server's printed startup line is parsed for the real URL because the server advances to the next free port when
  the preferred one is busy.

## Wiring

- Final step of `prepack`, so publishing cannot skip it.
- Final step of the CI workflow (after `build`, which guarantees a fresh `dist/`).
