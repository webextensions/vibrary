# 016 - Partial delete failure leaves the explorer showing already-deleted files

- **Area**: tightening error handling / UI state consistency after user actions
- **Files**: [frontend/src/App.tsx](../../frontend/src/App.tsx)
- **Status**: proposed (review only - not implemented)

## Finding

Both delete flows in `App.tsx` - `handleDelete` (folder/file node, around line 250) and `handleBulkDelete`
(multi-select footer, around line 277) - delete sequentially and refresh the listing only on the success path:

```ts
try {
    for (const path of paths) {
        await deleteFile(path);
        closeTab(path);
    }
    const listing = await listFiles();       // <- refresh happens only if EVERY delete succeeded
    setFiles(listing.files);
    ...
} catch (error) {
    setLoadError((error as Error).message);  // <- no refresh here
}
```

If the third of five deletes fails (file locked, permission change, server hiccup), the catch shows the error banner
but never re-fetches: the two files that WERE deleted stay visible in the explorer (their tabs already closed),
and clicking one produces a confusing "File not found". The UI's claim about the folder's contents is stale until
the user happens to press Refresh.

A related smell in the same code: the four-line "refresh the listing" sequence (`listFiles` +
`setFiles` + `setHasVibraryInclude` + `setLoadError(null)`, sometimes plus `loadTitleIndex`) is copy-pasted across
`handleRefresh`, `handleAddFile`, `handleAddFileInFolder`, `handleDelete`, `handleBulkDelete` (and the rename flow),
which is exactly why one copy can miss a case the others cover.

## Suggested improvement

- Move the listing refresh into a `finally` (or duplicate it into the catch) in both delete handlers, so the
  explorer reflects reality after ANY outcome - full success, partial failure, or immediate failure. Keep the error
  banner: the message plus an accurate list is strictly better than the message plus a stale list.
- Extract the repeated sequence into one helper (e.g. `refreshListing({ withTitles })` inside `App`), used by all
  the call sites; the delete fix then becomes "call it in finally". This also shrinks `App.tsx`, the second-largest
  file in the repo.
- Optional message upgrade while there: include the failing path in the banner
  (`Failed to delete "docs/specs-x.xml": ...`), since a bulk failure currently reports only the raw error with no
  indication of which file or how many were already removed.

## Verification

- `node --run lint`, `node --run typecheck`, and `node --run test` pass.
- Manual check: make one file undeletable (e.g. `chmod 555` its parent dir after creating two siblings), bulk-delete
  all three, and confirm the explorer now shows exactly the surviving file plus the error banner - no ghost rows.

## Risk

Low. The refresh call already runs on the success path; extending it to the failure path only adds a re-fetch that
the user would otherwise perform manually.
