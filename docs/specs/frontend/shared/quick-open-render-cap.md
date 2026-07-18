# Quick-open palette render cap

`QuickOpen` ([frontend/src/shared/QuickOpen.tsx](../../../frontend/src/shared/QuickOpen.tsx)) renders at most
`MAX_SHOWN` (100) matching rows; when more match, a muted note reports "...and N more - keep typing to narrow".

## Why

With an empty query, "matching" means everything: every file plus every entry title in the folder. Opening Cmd/Ctrl+K
in a large vibrary built thousands of DOM buttons before the user typed a character, and every keystroke re-rendered
the full list - a noticeable lag on the phone-class hardware the app supports, for rows nobody scrolls (the palette's
point is reaching things by typing, not scanning). The backend search caps its response at 500 matches for the same
reason; the palette now follows the app's bounding philosophy and the Search panel's truncation vocabulary.

## Behavior

- Keyboard navigation (wrap-around Up/Down, `safeIndex` clamping, aria-activedescendant) operates within the shown
  slice unchanged.
- Virtualizing instead would preserve scroll-through-everything, but that is a dependency and complexity the project
  avoids elsewhere; the slice keeps the fix in one file.
