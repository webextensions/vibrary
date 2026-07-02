# 043 - Relates-to chip navigation: silent dead clicks and wrong-entry highlights

- **Area**: aligning behavior with what a user expects from a control
- **Files**: [frontend/src/App.tsx](../../frontend/src/App.tsx),
  [frontend/src/components/SpecsEditor.tsx](../../frontend/src/components/SpecsEditor.tsx)
- **Status**: proposed (review only - not implemented)

## Finding

Clicking a "Relates to" chip goes through `handleOpenRelated` (App.tsx ~line 567), which has two gaps:

- **Stale references are a silent dead click.** When the chip's title is not in `titleIndex` (target renamed or
  removed, or created outside the app since the index last refreshed), the handler deliberately no-ops - the
  comment says "there is nothing sensible to navigate to". From the user's side a visibly clickable chip does
  nothing at all: no navigation, no message, no cursor change. The app already ships react-toastify for exactly
  this kind of transient notice; "No entry titled <title> found - it may have been renamed or removed" would turn
  a mystery into an answer (and hint that the reference itself is stale and worth cleaning).
- **The highlight can land on the wrong entry.** For a found title, the handler reuses the search-result mechanism:
  `handleOpenMatch(entry.path, title)` with `matchIndex 0`. The editor's `highlightMatchId` then selects the FIRST
  entry whose `title\ncontent\nnotes` CONTAINS the title as a substring. Any entry earlier in the file that merely
  MENTIONS the target title in its content or notes - which is exactly what related entries do - wins over the
  entry actually bearing the title. The comment's assumption ("its title is unique enough that the first match is
  always the right one") holds for title-vs-title collisions but not for title-vs-content mentions, and `relatesTo`
  chips guarantee such mentions exist.

## Suggested improvement

- Dead click: in the `entry === undefined` branch, fire a toast (the pattern `ActivityNotifier` already uses).
  Optionally also refresh `titleIndex` first and retry once, so a chip pointing at a just-created entry resolves
  instead of toasting.
- Wrong entry: navigate by exact title instead of by substring order. Smallest change: extend the editor's search
  target with a discriminator, e.g. `{ query, matchIndex, exactTitle?: true }`; when set, `highlightMatchId`
  matches `spec.title === query` only. `handleOpenRelated` passes `exactTitle`, search results keep today's
  behavior (whose own line-vs-entry mismatch is review 041's subject - fixing that one does not fix this one, and
  the two changes compose).

## Verification

- `node --run lint`, `node --run typecheck`, and `node --run test` pass.
- Manual checks: (a) delete an entry another entry relates to, click the stale chip - a toast explains; (b) file
  where entry 1's content mentions "target-title" and entry 5 IS `target-title` - clicking the chip highlights
  entry 5, not entry 1.

## Risk

Low. Additive toast plus a scoped matching mode; plain search-result navigation is untouched.
