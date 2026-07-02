# 005 - No root README ships with the npm package; publish metadata is half-filled

- **Area**: docs truthfulness / general cleanup of half-finished edges
- **Files**: [package.json](../../package.json), [docs/README.md](../README.md)
- **Status**: proposed (review only - not implemented)

## Finding

The repository has no root `README.md`. The documentation lives in `docs/README.md`, which GitHub happens to render
on the repo front page (its root -> `.github/` -> `docs/` fallback), but npm has no such fallback:

- `npm pack --dry-run` shows the tarball contains 37 files and no README at all (the `files` allowlist covers only
  `bin`, `backend`, `dist`, and npm's automatic README inclusion only applies to a root-level README).
- Result: the npmjs.com package page for `vibrary` renders with no description beyond the one-liner, and
  `npm docs vibrary` / the `homepage` field's `https://github.com/webextensions/vibrary#readme` anchor promise a
  readme section that only exists thanks to GitHub's docs/ fallback.

Related half-finished publish metadata in `package.json`:

- `"keywords": []` - empty, so npm search has nothing to index the package under.
- `"author": ""` - empty string rather than an actual author or removal of the field.

## Suggested improvement

- Add a root `README.md`. Two reasonable shapes:
    - a concise landing page (what vibrary is, install, `vibrary-server` quick start) that links into
      `docs/README.md` for the rest, or
    - move `docs/README.md` to the root outright and leave deep-dive pages (`editor.md`,
      `vibrary-file-format.md`) in `docs/` - per the repo owner's no-legacy-traces preference, whichever is chosen
      should not leave a stub behind.
- Fill `keywords` with a few honest terms (e.g. `reviews`, `specs`, `tasks`, `xml`, `local-web-ui`) and either fill
  or drop the empty `author` field.

## Verification

- `npm pack --dry-run` lists `README.md` in the tarball after the change.
- The GitHub repo front page still renders the same landing content.
- `node --run lint` passes (markdown is untouched by lint, but the prepack chain should stay green).

## Risk

Low. Documentation and metadata only; no runtime code changes. The only decision needing care is where the canonical
README lives, so links inside `docs/` stay correct.
