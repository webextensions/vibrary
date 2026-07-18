# Listing walk: wider default ignores

`listVibraryFiles` ([backend/files/vibraryFiles.js](../../../backend/files/vibraryFiles.js)) skips the common
build-output and vendor directories (`dist`, `build`, `out`, `coverage`, `.next`, `.venv`, `vendor`, `target`)
alongside `node_modules` and `.git`.

## Why

The walk globs the ENTIRE served tree and is linear in tree size regardless of how few vibrary files exist - measured
~12 ms per call at 5,000 files and ~107 ms at 50,000 (warm cache) - and every listing, summary (refetched after every
save), and search request pays it. Big trees' file counts usually live in build output, where vibrary files plausibly
never do; a user keeping `specs.xml` in `dist/` is fighting their own build tool, so no escape hatch is provided.

## The TTL cache option, deliberately not taken

The suggestion's second option - memoizing the glob result for ~1 s - claimed existing behavior would be preserved,
but it would break a real contract: creating a file (POST /files) triggers an immediate listing refresh that must
show the new file, and the summary route's freshness test pins next-call visibility of on-disk changes. Making a TTL
cache correct would require mutation-invalidation hooks across the write routes - machinery not warranted until
someone actually hits the remaining cost. The re-walk-per-request design stays, now documented (with the
measurements) at the constant's definition.
