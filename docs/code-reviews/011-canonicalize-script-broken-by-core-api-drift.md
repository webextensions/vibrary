# 011 - canonicalize-vibrary.js is silently broken: reorder-insensitive diffs never work

- **Area**: tightening code and logic (real bug) / docs claims no longer truthful
- **Files**: [scripts/canonicalize-vibrary.js](../../scripts/canonicalize-vibrary.js),
  [scripts/vibrary-diff.js](../../scripts/vibrary-diff.js),
  [frontend/src/vibraryXmlCore.js](../../frontend/src/vibraryXmlCore.js),
  [docs/README.md](../README.md)
- **Status**: proposed (review only - not implemented)

## Finding

`canonicalize()` in `scripts/canonicalize-vibrary.js` throws on EVERY valid vibrary file, so the documented
"reorder-insensitive diffs" feature (docs/README.md, Development section) has been dead code end to end. Verified
directly:

```
$ node -e "import('./scripts/canonicalize-vibrary.js').then(async ({ canonicalize }) => { ... })"
canonicalize THREW: entries.map is not a function
```

Root cause: the script targets a core API shape that `vibraryXmlCore.js` does not have (anymore or ever):

- `const { type, entries } = parseVibraryXml(xml)` - but `parseVibraryXml` returns a plain ARRAY of entries. The
  destructured `entries` binds to `Array.prototype.entries` (a function), so `entries.map(...)` throws. `type` is
  always `undefined`, so the comment "The file's own `<metadata><type>` drives output" is also untrue -
  `parseVibraryXml` never reads `<metadata>` at all.
- `serializeVibraryXml(fileType, [spec])` - but `serializeVibraryXml(entries)` takes a single entries argument; the
  script passes the file type where the entries belong, which would throw too if execution ever got that far.

The failure is invisible because BOTH consumers wrap the call in a broad catch that falls back to raw bytes:

- `canonicalize-vibrary.js`'s own `main()` prints the input unchanged (`node scripts/canonicalize-vibrary.js
  docs/reviews/reviews.xml` outputs the file byte-for-byte and exits 0, masquerading as "already canonical"),
- `vibrary-diff.js`'s `toCanonical()` returns the raw XML, so the diff driver always compares raw bytes and a pure
  reordering shows as a full diff - exactly what the whole `.gitattributes`/`.gitconfig` machinery exists to
  suppress.

Those fallbacks are meant for genuinely malformed XML, not for "our own code no longer matches the core API".

## Suggested improvement

- Fix the script to the real API: `const entries = parseVibraryXml(xml)`, sort as before, and serialize with
  `serializeVibraryXml(sortedEntries)`. The `fileType` plumbing (and the stale `<metadata><type>` comment) goes away
  entirely since serialization does not take a type.
- Make the failure mode diagnosable so this cannot rot silently again: in `vibrary-diff.js`'s `toCanonical` and the
  CLI's catch, write a one-line warning to stderr (git surfaces a diff driver's stderr) before falling back to raw
  bytes.
- Add a regression test (the repo already tests `vibraryXmlCore` round-trips): `canonicalize()` on a small fixture
  must equal `canonicalize()` of the same fixture with entries/fields/list items reordered. This is the exact
  invariant the diff driver depends on, and it fails loudly today. Note review 004's point that the current test
  glob only picks up `frontend/src/**/*.test.js` - a `scripts/*.test.js` would need the same glob widening.

## Verification

- The one-liner above stops throwing and returns canonical XML.
- `node scripts/canonicalize-vibrary.js docs/reviews/reviews.xml` prints sorted-entry output rather than echoing the
  file.
- End to end: reorder two `<entry>` blocks in a committed vibrary file; `git diff` shows nothing (driver suppresses
  the pure reordering); a real content edit still shows the full raw diff.
- `node --run lint`, `node --run typecheck`, and `node --run test` pass.

## Risk

Low-to-medium: the change only affects diff presentation and an inspection CLI (never file contents on disk), but the
driver runs on every `git diff` of vibrary files, so the fix should be manually exercised against add/delete cases
(`/dev/null` sides) as well as ordinary edits.
