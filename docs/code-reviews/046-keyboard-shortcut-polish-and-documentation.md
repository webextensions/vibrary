# 046 - Keyboard shortcuts: Ctrl+S over-matches modifiers, reopen-tab has no key, and the surface is undocumented

- **Area**: polishing UI/UX (keyboard access) / docs completeness
- **Files**: [frontend/src/App.tsx](../../frontend/src/App.tsx), [docs/editor.md](../editor.md)
- **Status**: proposed (review only - not implemented)

## Finding

- **Ctrl+S over-matches.** The save handler (App.tsx ~line 465) checks only
  `(event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's'`. Because `key` for Ctrl+Shift+S is `'S'`
  and the handler lowercases it without checking `shiftKey`/`altKey`, Ctrl+Shift+S and Ctrl+Alt+S are also
  intercepted (preventDefault always fires) and treated as Save. Ctrl+Shift+S is a real browser/user binding
  ("Save As" in some browsers, screenshot tools, screen recorders); the app hijacks it for no benefit. One
  `event.shiftKey || event.altKey` guard restores those combos to their owners.
- **Reopen-closed-tab is mouse-only.** The tab machinery tracks recently closed tabs (`closedPaths`,
  `reopenClosedTab`) and exposes a toolbar button, but there is no Ctrl+Shift+T - the binding every browser and
  editor user will try first, and the natural companion to the already-implemented middle-click-to-close
  (`TabBar`'s `onAuxClick`, added expressly "like browser and editor tab strips"). The same expectation argument
  that justified middle-click justifies the reopen key.
- **The shortcut surface is undocumented.** `docs/editor.md` mentions Ctrl+S and one Escape behavior; nothing
  covers the rest of what exists: Escape closes any popup/menu, Escape clears the entry/file selections (with the
  layered popup-first rule the code carefully implements), middle-click closes a tab, right-click opens the tab
  context menu, Ctrl+Enter sends a chat follow-up. Users can only discover these by accident; a short "Keyboard
  and mouse shortcuts" section in `editor.md` makes the deliberate interaction design visible.

## Suggested improvement

- Add the modifier guard to the Ctrl+S handler (matching what the comment already claims: "matching every other
  text editor" - editors do not treat Ctrl+Shift+S as plain Save).
- Bind Ctrl+Shift+T (and Cmd+Shift+T) to `reopenClosedTab` in the same keydown effect, guarded on
  `closedTabCount > 0` mirroring the button's disabled state - noting the browser reserves it for reopening
  browser tabs when unfocused content does not preventDefault, which this handler would.
- Add the shortcuts section to `docs/editor.md`, one line per binding, alphabetized per the repo's markdown
  conventions.

## Verification

- `node --run lint`, `node --run typecheck`, and `node --run test` pass.
- Manual check: Ctrl+Shift+S no longer saves nor preventDefaults (browser behavior returns); Ctrl+S still saves;
  close a tab, Ctrl+Shift+T reopens it; docs list matches every binding grep can find (`ctrlKey|metaKey|Escape|
  onAuxClick` sweep).

## Risk

Low. One guard, one added binding behind existing state, and documentation.
