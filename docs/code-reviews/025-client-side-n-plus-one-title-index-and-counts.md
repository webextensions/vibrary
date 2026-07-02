# 025 - Title index and approval counts re-download every file's full content on every change

- **Area**: adopting best practices (API shape) / efficiency of a hot path
- **Files**: [frontend/src/api.ts](../../frontend/src/api.ts),
  [frontend/src/useFileCounts.ts](../../frontend/src/useFileCounts.ts),
  [frontend/src/App.tsx](../../frontend/src/App.tsx),
  [backend/routes/files.js](../../backend/routes/files.js)
- **Status**: proposed (review only - not implemented)

## Finding

Two client-side aggregates are computed by downloading and parsing the FULL content of every vibrary file in the
folder:

- `loadTitleIndex()` (`api.ts`) calls `listFiles()` and then `getFile(name)` for EVERY file in parallel, parses each
  with `parseVibraryXml`, and keeps only the titles. App calls it on startup, after every save (`onSave`), after
  generate, after delete, and on every sidebar Refresh.
- `useFileCounts` calls `getApprovalCount(name)` per file - which is also `getFile` + full parse - sequentially for
  every file, re-running whenever the `files` array changes identity, which `setFiles(listing.files)` does on every
  refresh/create/delete/rename.

So the steady-state cost of SAVING ONE FILE is: one PUT, then a full re-download and re-parse of every file in the
workspace for titles, and (after any listing change) another full re-download of every file for two integers each.
The payloads are whole XML documents; the derived data is a string list and per-file `{ approved, total }`. On a
folder with dozens of entry-heavy files (or over a slow LAN connection - the app's own phone use case), the
workspace-wide refetch after each save is noticeable and entirely avoidable.

There is also a correctness wrinkle: `loadTitleIndex` dedupes titles across files with first-seen-wins while files
resolve in parallel, so which file a duplicated title points at is nondeterministic between runs.

## Suggested improvement

- Add one backend summary endpoint, e.g. `GET /api/files/summary`, returning per file:
  `{ name, titles: [...], approved, total }` - computed server-side in a single pass over the same
  `listVibraryFiles` set (the backend already imports the shared `vibraryXmlCore.js`, so `parseVibraryXml` +
  `countApprovedSpecs` run there identically). One request replaces 2N.
- Frontend: `loadTitleIndex` and `useFileCounts` both consume that response; `markCounted` keeps its current role
  for unsaved-edit badges. Deterministic title dedupe falls out for free (server iterates files in listing order).
- Smaller interim alternative (no backend change): fetch each file once and derive BOTH aggregates from the single
  response - i.e. merge the two loaders so the workspace is downloaded once per change instead of twice.

## Verification

- `node --run lint`, `node --run typecheck`, and `node --run test` pass.
- Devtools network check before/after: saving a file currently fires `GET /api/files/<name>` for every file in the
  folder (plus the count refetches after listing changes); after the change it fires one summary request. Badges,
  the "Relates to" options, and chip navigation behave identically.

## Risk

Low-to-medium: a new endpoint plus consumer rewiring touches several call sites, but each is a mechanical
substitution and the interim single-download variant is available if the endpoint is deferred.
