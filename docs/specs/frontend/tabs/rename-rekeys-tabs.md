# Rename rekeys open tabs instead of closing them

Renaming a file (or a folder, which renames every file beneath it) no longer closes and reopens the affected tabs -
each open tab is REKEYED to the new path, keeping its parsed entries, its dirty flag, and its `fileHash`. Unsaved
edits survive the rename; the confirmation shown when an affected tab is dirty now states what actually happens
("unsaved changes will follow the renamed file and remain unsaved until you save") instead of warning that the edits
will be lost.

## Why this is correct

A rename is `fs.rename`: it moves bytes without changing them. Everything a tab holds is therefore still valid after
the rename:

- The parsed `specs` are independent of the filename.
- The `fileHash` version token the save route's lost-update guard checks is a hash of the CONTENT, which is unchanged
  - so a save after the rename still passes the guard, and a save on a file that also changed on disk still 409s
  (the guard is not weakened).
- Only the path changed, and the path is the tab's key - hence a rekey, not a reload.

A rename with unsaved edits leaves the new file on disk holding the last SAVED content; the tab stays dirty, so the
user saves as usual - to the new path.

## Where

- [frontend/src/tabs/rekeyTabs.ts](../../../frontend/src/tabs/rekeyTabs.ts) - the pure state transform (tabs mapped to
  the new path, the active path following when it pointed at the old name, an untouched-state fast path).
- [frontend/src/tabs/useOpenTabs.ts](../../../frontend/src/tabs/useOpenTabs.ts) - the `rekeyTab` action wrapping it. A
  tab rekeyed while its initial load is in flight self-heals: the stale response is dropped by the load effect's
  open-tab guard, and the effect then fetches the new path.
- [frontend/src/explorer/useFileOperations.ts](../../../frontend/src/explorer/useFileOperations.ts) - the rename flow
  calls `rekeyTab(from, to)` where it used to `closeTab(from)`; a not-open file renames exactly as before.
- Session restore needs no change: the persisted open-tab record derives from the live tabs array
  (`useSessionRestore`'s open-paths signature), so the stored paths follow the rekey automatically.

## Tests

[frontend/src/tabs/rekeyTabs.test.ts](../../../frontend/src/tabs/rekeyTabs.test.ts) pins the carry-over (entries via
the generic tab shape, dirty flag, fileHash), the active-path follow, and the same-reference no-op for a file with no
open tab.
