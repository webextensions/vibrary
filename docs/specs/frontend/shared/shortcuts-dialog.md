# ShortcutsDialog accuracy

The keyboard-shortcuts help dialog (`frontend/src/shared/ShortcutsDialog.tsx`) is the app's discoverability surface
for its keyboard support, and its `SHORTCUT_GROUPS` list is maintained BY HAND - the third copy of this information
after the code's scattered handlers and `docs/editor.md`.

Two rows once drifted and were realigned:

- The Tabs group lists `Home` / `End` together ("Jump to the first / last tab") matching `TabBar`'s handler, in the
  same combined one-row style the entry-cards group already uses.
- The Escape row states the app-wide convention: "Close a dialog or menu; with none open, clear the entry or file
  selection" (`useEscapeToClear`, wired in SpecsEditor and Sidebar) - not the incidental native search-input clearing.

## Drift risk

Three hand-synchronized listings (code, `docs/editor.md`, this dialog) will keep drifting; centralizing them is not
realistic because the code's handlers are deliberately scattered per surface (see the isolated-listener comments in
`App.tsx`). When adding or changing a shortcut, update all three: the handler, `docs/editor.md`'s shortcuts section,
and `SHORTCUT_GROUPS`.
