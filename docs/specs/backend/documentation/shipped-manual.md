# The shipped manual: docs/*.md in the tarball, served at /api/docs/:name

The package ships the top-level manual pages (`docs/*.md` in package.json's `files` - deliberately NOT the internal
`docs/specs` tree), and [backend/documentation/documentation.js](../../../backend/documentation/documentation.js)
serves them at `GET /api/docs/:name` for the Help dialog's Guide tab. Before this, an installed user (`npm install -g vibrary`) had the app and none of its
documentation on disk - the only in-app help was the shortcuts dialog.

## The deliberate exceptions in this route

Every other file route in this app resolves against the served `cwd` and is gated by `.vibraryinclude`. This one does
neither, on purpose: the manual lives inside the INSTALLED package's own `docs/` directory (resolved relative to the
module, not the process), because the user's project has no reason to contain vibrary's manual. That exception is
exactly why the route must stay a tight allowlist of known file names (`README.md`, `editor.md`,
`vibrary-file-format.md`) - a path-shaped name never reaches the filesystem; it 404s at the allowlist.

## The packaging assertion

The one thing that keeps this true over time is the smoke test:
[scripts/smoke-test-package.js](../../../scripts/smoke-test-package.js) hits `/api/docs/editor.md` on the packed,
`--omit=dev`-installed server, so dropping `docs/*.md` from `files` (or moving the docs) fails `prepack` and CI rather
than silently shipping a Guide tab that 404s for every installed user.

## Tests

[backend/documentation/documentation.test.js](../../../backend/documentation/documentation.test.js) serves each
allowlisted page and proves the package-not-cwd resolution with a decoy `editor.md` placed in the served folder;
everything outside the allowlist (including encoded path separators) is a 404.
