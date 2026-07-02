# 007 - Six copies of the popup dismiss-on-outside-click-or-Escape effect

- **Area**: modularising / extracting shared helpers (custom hook)
- **Files**: [frontend/src/components/SpecsEditor.tsx](../../frontend/src/components/SpecsEditor.tsx),
  [frontend/src/components/ActivityMonitor.tsx](../../frontend/src/components/ActivityMonitor.tsx),
  [frontend/src/components/TabBar.tsx](../../frontend/src/components/TabBar.tsx),
  [frontend/src/components/Sidebar.tsx](../../frontend/src/components/Sidebar.tsx)
- **Status**: proposed (review only - not implemented)

## Finding

The app's popup convention (close on outside click or Escape) is implemented as a copy-pasted `useEffect` in six
places:

- `SpecsEditor.tsx` - three copies back to back, one each for the speed-dial menu (~line 167), the Actions popup
  (~line 190), and the Operations popup (~line 213); identical except for the open-flag and ref they close over.
- `ActivityMonitor.tsx` - the Settings popover (~line 127), which even carries a comment saying it matches "every
  other popup in the app (Sidebar/TabBar menus, SpecsEditor's speed-dial/Operations/Actions popups)".
- `TabBar.tsx` (~line 28) and `Sidebar.tsx` (~line 317) - context-menu variants of the same listener pair.

Each copy registers a document `mousedown` listener that checks `ref.current.contains(event.target)` plus a `keydown`
listener for Escape, and removes both on cleanup. Because the convention is duplicated, it is already drifting in
small ways (some copies null-check the ref with `?.`, one with `!== null`; the git history shows Escape support being
retrofitted to one copy at a time - commit `5f20d75` added it to the ActivityMonitor popover only). Any future
refinement - e.g. also closing on focus leaving the popup, or switching to `pointerdown` for touch - must be applied
six times.

## Suggested improvement

- Extract one hook, e.g. `frontend/src/useDismissablePopup.ts`:

  ```ts
  const useDismissablePopup = function (
      open: boolean,
      containerReference: RefObject<HTMLElement | null>,
      onDismiss: () => void
  ): void { /* the existing listener pair, once */ };
  ```

- Replace the six effects with one call each:
  `useDismissablePopup(actionsOpen, actionsReference, function () { setActionsOpen(false); });`
- Keep the per-site comments that explain WHY the popup dismisses (they carry real context, e.g. Sidebar's note about
  menu buttons stopping propagation); only the mechanical listener plumbing moves.
- This also trims roughly 60 lines from `SpecsEditor.tsx`, the repo's largest file, as a side benefit.

## Verification

- `node --run lint`, `node --run typecheck`, and `node --run test` pass.
- Manual sweep of all six popups (SpecsEditor speed-dial/Actions/Operations, ActivityMonitor settings, TabBar and
  Sidebar context menus): each still closes on outside click and on Escape, and each still stays open when clicking
  inside itself.

## Risk

Low. Pure consolidation of an already-identical pattern; the hook's dependency array mirrors what each copy already
uses (`open` plus stable ref/setter identities).
