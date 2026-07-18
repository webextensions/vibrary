# shared/apiLimits.js - isomorphic API bounds

[shared/apiLimits.js](../../shared/apiLimits.js) holds the bounds the backend enforces AND the frontend mirrors in its
inputs:

- `MAX_GENERATE_COUNT` (50) - the create dialog's number-input max and the `/generate` route's 400.
- `MIN_QUERY_LENGTH` (2) - the SearchPanel's skip-the-round-trip floor and the search route's empty-result floor.

## Why

Each value was previously defined twice - once per side - connected only by a keep-in-sync comment. Drift is a quiet
failure either way: a stale-high frontend copy lets the user fill a valid-looking form and get a backend 400 written
for API callers; stale-low silently hides capacity the server would accept.

## Packaging

The module ships in the npm tarball (its own entry in package.json `files`) because the backend imports it at
runtime. Any new shared module needs the same entry - the packaged-tarball smoke test
([packaged-tarball-smoke-test.md](../tooling/packaged-tarball-smoke-test.md)) catches a missed one, since the server
fails to start when a runtime import is absent from the installed package.

A second shared module (rather than piggybacking on `vibraryXmlCore.js`) because an HTTP request bound is not XML
vocabulary; with two constants the dedicated home earns its packaging footprint.
