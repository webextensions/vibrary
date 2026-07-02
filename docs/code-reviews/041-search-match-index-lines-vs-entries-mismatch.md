# 041 - Clicking the Nth search result can highlight the wrong entry (line-index vs entry-index mismatch)

- **Area**: tightening logic (mismatched units across a boundary)
- **Files**: [backend/utils/searchVibrary.js](../../backend/utils/searchVibrary.js),
  [frontend/src/components/SearchPanel.tsx](../../frontend/src/components/SearchPanel.tsx),
  [frontend/src/components/SpecsEditor.tsx](../../frontend/src/components/SpecsEditor.tsx)
- **Status**: proposed (review only - not implemented)

## Finding

The search-to-editor handoff counts different things on each side of the boundary:

- Backend/SearchPanel: a "match" is a LINE of the raw XML containing the query (`collectMatchesInFile` splits on
  newlines). The panel passes each match's index within its file's match list (`onOpenMatch(file.path,
  searchedQuery, matchIndex)`).
- Editor: `highlightMatchId` (SpecsEditor.tsx ~line 112) interprets that number as an index into the ENTRIES whose
  `title\ncontent\nnotes` contain the query.

Those sequences diverge in ordinary cases:

- An entry whose content contains the query on three separate lines contributes THREE line matches but ONE entry
  match. Clicking the second or third result for that entry skips ahead to highlight the wrong entry entirely.
- The backend searches the raw XML, so lines match on things the editor's filter ignores: `<label>` values,
  `<ref>` titles, timestamps - even XML syntax itself (searching "task" matches every `<entry type="task">` line).
  Each such line shifts the line-index sequence with no counterpart in the entry sequence.

The editor's clamp ("an index past the last match clamps to the last one") was designed for stale indexes, but it
also silently absorbs this systematic mismatch - the click always lands SOMEWHERE, just often on the wrong card,
which reads as flaky search rather than a unit bug.

## Suggested improvement

- Make the mapping entry-aware at the source: `searchVibrary` runs on the backend, which already imports the shared
  core elsewhere - parse each candidate file with `parseVibraryXml` and search per entry (title/content/notes),
  returning matches as `{ entryIndex, field, snippet }` (per-line snippets within an entry can stay grouped under
  it). The panel then passes `entryIndex` straight through, and `highlightMatchId` becomes a simple
  `specs[entryIndex]` lookup with the existing clamp for staleness.
- This also upgrades the results list for free: grouping by entry title reads better than raw XML lines, and
  matches in XML tags/attributes stop appearing at all (today searching "entry" or "task" floods the panel with
  markup lines - arguably its own paper cut).
- Smaller interim fix if parsing is deferred: dedupe line matches per entry on the backend by tracking which
  `<entry>` block each line falls in (a lightweight scan for `<entry` boundaries), so index N means "Nth matching
  ENTRY" on both sides.

## Verification

- `node --run test` (add a table-driven test for the new search shape), `node --run lint`, `node --run typecheck`.
- Manual check: create one file where entry A contains the query twice and entry B once; click each of the three
  results - each highlights the entry it belongs to. Search "task" in a tasks file - no markup-only matches appear.

## Risk

Medium-low: the search response shape changes, but SearchPanel is its only consumer, and the behavior change is
strictly toward what the UI already pretends happens.
