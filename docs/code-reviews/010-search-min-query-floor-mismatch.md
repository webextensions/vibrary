# 010 - Search's minimum-query floor exists only in the frontend, contradicting its own comment

- **Area**: keeping comments truthful to the code / aligning frontend and backend contracts
- **Files**: [backend/utils/searchVibrary.js](../../backend/utils/searchVibrary.js),
  [frontend/src/components/SearchPanel.tsx](../../frontend/src/components/SearchPanel.tsx)
- **Status**: proposed (review only - not implemented)

## Finding

`SearchPanel.tsx` (around line 14) declares:

```ts
// Match the backend's floor; a one-character query is too broad to be useful.
const MIN_QUERY_LENGTH = 2;
```

But the backend has no such floor. `searchVibrary()` only rejects empty/whitespace queries:

```js
if (typeof query !== 'string' || query.trim() === '') {
    return { results: [], truncated: false };
}
```

So `GET /api/search?q=e` happily scans every included file for a single character - exactly the "too broad to be
useful" case the constant exists to prevent. The guard the comment attributes to the backend lives only in the UI,
which means the caps (`MAX_TOTAL_MATCHES`, per-file limits) are all that stand between a one-character query and a
full-folder scan returning 500 matches.

A second, smaller inconsistency in the same function: the emptiness check trims (`query.trim() === ''`) but the
needle does not (`const needle = query.toLowerCase()`). The frontend always sends a trimmed query, so this is
currently unreachable through the UI, but a direct API call with `q=" ab"` searches for the padded string - probably
not what any caller intends given the function already treats surrounding whitespace as meaningless.

## Suggested improvement

- Add the floor where the comment says it is: in `searchVibrary()`, return the empty result for
  `query.trim().length < 2` (hoisting a shared `MIN_QUERY_LENGTH = 2` constant, or mirroring the value with a
  comment on each side pointing at the other, matching how `MAX_GENERATE_COUNT` is mirrored between
  `CreateEntriesDialog.tsx` and `backend/routes/files.js`).
- While there, search with the trimmed needle (`query.trim().toLowerCase()`) so the emptiness check and the actual
  scan agree on what the query is.
- If adding the backend floor is not wanted, the frontend comment should stop claiming the backend has one.

## Verification

- `node --run lint`, `node --run typecheck`, and `node --run test` pass.
- `curl 'localhost:3000/api/search?q=e'` returns `{ results: [], truncated: false }` after the change (and a
  two-character query still returns matches).
- UI behavior is unchanged: the panel already never sends sub-2-character queries.

## Risk

Low. The only observable change is to direct API callers sending queries the UI already refuses to send.
