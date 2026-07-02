# 045 - App.tsx has become the junk drawer: split its three separable concerns into hooks

- **Area**: modularising / splitting oversized files
- **Files**: [frontend/src/App.tsx](../../frontend/src/App.tsx)
- **Status**: proposed (review only - not implemented)

## Finding

`App.tsx` is 771 lines with 39 hook call sites - the second-largest file in the repo - and it interleaves at least
three concerns that have natural seams, on top of its real job (composing the layout):

- **File CRUD handlers** (~lines 159-398): `handleRefresh`, `handleAddFile`, `handleNewFile`, `handleDelete`,
  `handleBulkDelete`, `handleRename`, `handleDuplicate` - each a prompt/confirm + api call + the copy-pasted
  listing-refresh sequence (review 016 documents how one copy already missed the failure path). These share only
  `files`/`titleIndex`/`loadError` state and a couple of tab callbacks; nothing else in App touches their logic.
- **Session persistence** (~lines 74-155): `workspaceCwd`, `sessionReady`, the restore-on-load effect and the
  persist-on-change effect around `readSessionTabs`/`writeSessionTabs` - self-contained plumbing whose only
  interface to the rest of App is `openOrFocus`/`setActive`/`tabs`.
- **Editor chrome state**: sidebar collapse (+ its localStorage idiom), the filter dropdown trio, Ctrl+S handling,
  the beforeunload guard.

The repo already has the exact pattern to follow: `useOpenTabs.ts` and `useFileCounts.ts` are precisely such
extracted hooks, each owning one concern with a narrow return surface. The remaining concerns simply never got the
same treatment as they accreted.

## Suggested improvement

Extract along the existing seams, matching the established hook style (one file per hook, named export):

- `useFileOperations.ts` - owns `files`, `hasVibraryInclude`, `titleIndex`, `loadError` and returns the seven
  handlers plus a shared `refreshListing()` (implementing review 016's fix once, in one place). Takes the few tab
  callbacks it needs as parameters, like `useFileCounts` takes `openTabs`.
- `useSessionRestore.ts` - owns `workspaceCwd`/`sessionReady` and both session effects; returns nothing App needs
  beyond being mounted (or just `workspaceCwd` if something else ever wants it).
- Optionally a `Toolbar`/`EditorHead` component for the header block (menu toggle, TabBar, reopen button,
  Save/Reload/Filter buttons), which is pure presentation over props.

App.tsx drops to roughly its composition role (~350-400 lines), and each extracted piece becomes independently
readable and testable. No behavior change intended; this is code motion plus the 016 consolidation.

## Verification

- `node --run lint`, `node --run typecheck`, and `node --run test` pass.
- Manual smoke: open/edit/save a file, add/rename/duplicate/delete from the explorer, reload the page and confirm
  the tab session restores, Ctrl+S saves, dirty-close still confirms.

## Risk

Medium-low: a wide but mechanical refactor. Doing it AFTER the small fixes that touch the same lines (016, 022's
callers, 044) avoids rebasing those; alternatively do it first and land the fixes inside the new hooks.
