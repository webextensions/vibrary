# Search precision: Match case and Whole word

The folder-wide Search accepts two per-query precision flags - `matchCase=1` and `wholeWord=1` on `/api/search`,
surfaced as checkboxes in the Search panel. Both default off, which reproduces the original case-insensitive substring
scan byte-for-byte; turning them on tightens matching for identifier-shaped queries ("API" vs "api"; "id" without
"identity"). The flags apply to every matched surface: title, content, notes, and labels.

## Why

The app contained two text-matching engines and the weaker one was the folder-wide one: Find & replace honors its
**Match case** toggle, while Search unconditionally lowercased both sides - so a term could be case-sensitively
*replaced* but not case-sensitively *found*. Identifiers are exactly what people search a spec library for, and the
asymmetry read as an oversight.

## The matching rules

`findMatchIndex` in [backend/search/searchVibrary.js](../../../backend/search/searchVibrary.js) is the one matcher:

- The needle is normalized once in `searchVibrary` (lowercased unless `matchCase`); only the haystack folds per field.
- Whole-word requires a non-word character (or the string edge) on both sides of the occurrence, with word characters
  being `[A-Za-z0-9_]`. A hyphen is a boundary, so whole-word "auth" still matches the hyphenated titles the
  `normalizeTitle` rule produces ("auth-token").
- The whole-word scan keeps looking past occurrences that fail the boundary check - "api" must find a later standalone
  word even when "capillary" comes first in the text.
- `buildSnippet` windows around the flag-honoring match index, so the snippet always contains the occurrence that
  actually matched.

The route layer ([backend/search/search.js](../../../backend/search/search.js)) parses the flags (`=== '1'`, anything
else means off) and forwards them; [frontend/src/api.ts](../../../frontend/src/api.ts) appends them only when set, so
the default request stays identical to the pre-flags one.

## Why the editor-side jump still works

The editor's staleness re-check (`highlightMatchId` in `SpecsEditor`) validates a clicked result with a
case-insensitive substring match. That is a strict superset of any flag-tightened backend match, so an entry index the
backend matched under `matchCase`/`wholeWord` always passes the re-check and the jump lands on the right entry. The
`<mark>` emphasis (the shared `splitByMatches`) likewise stays case-insensitive - it may additionally mark a
differently-cased occurrence inside a snippet, a cosmetic looseness accepted to keep the marking helper shared with
the editor.

## Deliberately not included: regex

The proposal this came from also weighed a regex mode and itself concluded it must not ship without a scan timeout
(a user-authored catastrophically-backtracking pattern would pin the single-process server that also runs the agent
queue). Per that analysis, regex was left out entirely rather than shipped unguarded.

## Tests

- [backend/search/searchVibrary.test.js](../../../backend/search/searchVibrary.test.js) - default behavior unchanged;
  matchCase distinguishes `API` from `api` (labels included); wholeWord excludes containing words, scans past them to
  later standalone occurrences, and treats hyphens as boundaries.
- [backend/search/search.test.js](../../../backend/search/search.test.js) - the route parses and forwards both flags.
