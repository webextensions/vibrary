# 012 - Sample vibrary file carries a <metadata> block the format dropped; saving silently deletes it

- **Area**: general cleanup of leftovers / docs-code-data consistency / save round-trip expectations
- **Files**: [docs/reviews/reviews.xml](../reviews/reviews.xml),
  [docs/vibrary-file-format.md](../vibrary-file-format.md),
  [frontend/src/vibraryXmlCore.js](../../frontend/src/vibraryXmlCore.js)
- **Status**: proposed (review only - not implemented)

## Finding

Three sources disagree about whether a vibrary file has a `<metadata>` block:

- `docs/vibrary-file-format.md` documents `<root>` containing only `<entries>`, and says explicitly: "The file
  itself has no type."
- `vibraryXmlCore.js` agrees: `parseVibraryXml` reads only `root.entries.entry` and `serializeVibraryXml` writes only
  `root > entries` (its comment repeats "the file itself has no type"). The string `metadata` appears nowhere in the
  code.
- But the repo's own sample/dogfood file `docs/reviews/reviews.xml` starts with:

  ```xml
  <root>
      <metadata>
          <type>reviews</type>
      </metadata>
      <entries>
  ```

The block is evidently a leftover from an earlier format revision that had a file-level type - the same revision
`scripts/canonicalize-vibrary.js` still codes against (see review 011, whose broken destructuring expects
`parseVibraryXml` to return `{ type, entries }` and whose comment cites "The file's own `<metadata><type>`").

Practical consequence beyond tidiness: the save path is parse -> edit -> `serializeVibraryXml`, so opening
`docs/reviews/reviews.xml` in the app and saving ANY edit silently deletes the `<metadata>` block. More generally,
any element outside the documented schema is dropped on save with no warning - acceptable as a design decision, but
currently the repo ships a file that walks right into it.

## Suggested improvement

- Decide the format question once: the code and format doc agree metadata does not exist, so remove the
  `<metadata>...</metadata>` block from `docs/reviews/reviews.xml` (a two-line deletion) rather than resurrecting
  file-level metadata. If file-level metadata IS wanted back, that is a separate feature touching parse, serialize,
  and the format doc together.
- Add one sentence to `docs/vibrary-file-format.md` stating the round-trip contract explicitly: elements outside the
  documented schema are not preserved by the editor's save. That makes the current (reasonable) behavior a documented
  guarantee instead of a surprise.

## Verification

- After removing the block: the app opens and saves `docs/reviews/reviews.xml` with a byte-stable round-trip (save
  with no edits produces no git diff).
- `node --run test` still passes (no fixture references the metadata block - the test file builds its own XML).
- `grep -rn metadata frontend backend scripts` still returns nothing, confirming no code path misses it.

## Risk

Low. The block is read by nothing; deleting it changes no behavior. The only caution is coordination with review 011:
if the canonicalize script is fixed first, its stale metadata comment should go in the same change.
