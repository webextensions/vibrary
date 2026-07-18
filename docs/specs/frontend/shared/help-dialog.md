# HelpDialog: Shortcuts and Guide tabs

The `?` dialog (`frontend/src/shared/HelpDialog.tsx`, formerly the shortcuts-only dialog) has two tabs:

- **Shortcuts** - the hand-maintained `SHORTCUT_GROUPS` list, unchanged in content and rules (see below).
- **Guide** - the shipped manual (Overview / Editor guide / File format), fetched from `/api/docs/:name` and rendered
  with the lazily-loaded react-markdown chunk (the same on-demand treatment SpecCard gives it). Pages are cached for
  the session. Cross-doc links in the markdown (`[editor.md](editor.md)`) switch the Guide page in place; absolute
  links open a new tab; anything else (in-page anchors, repo-relative code paths) renders as plain text so a click can
  never navigate the SPA somewhere broken.

The version footer doubles as the app's "about" surface, on both tabs.

## Shortcuts-list accuracy

The `SHORTCUT_GROUPS` list is maintained BY HAND - the third copy of this information after the code's scattered
handlers and `docs/editor.md`. Two rows once drifted and were realigned:

- The Tabs group lists `Home` / `End` together ("Jump to the first / last tab") matching `TabBar`'s handler, in the
  same combined one-row style the entry-cards group already uses.
- The Escape row states the app-wide convention: "Close a dialog or menu; with none open, clear the entry or file
  selection" (`useEscapeToClear`, wired in SpecsEditor and Sidebar) - not the incidental native search-input clearing.

### Drift risk

Three hand-synchronized listings (code, `docs/editor.md`, this dialog) will keep drifting; centralizing them is not
realistic because the code's handlers are deliberately scattered per surface (see the isolated-listener comments in
`App.tsx`). When adding or changing a shortcut, update all three: the handler, `docs/editor.md`'s shortcuts section,
and `SHORTCUT_GROUPS`. The Guide tab reduces the pressure on the other prose: it renders `docs/editor.md` itself, so
the manual and the in-app guide are one document by construction.
