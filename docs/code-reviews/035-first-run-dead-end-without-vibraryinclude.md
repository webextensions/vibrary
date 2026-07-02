# 035 - First run in a fresh folder is a dead end: no .vibraryinclude means even "+" fails, and the file is undocumented

- **Area**: aligning behavior with user expectations (first-run/empty-state flow)
- **Files**: [frontend/src/components/Sidebar.tsx](../../frontend/src/components/Sidebar.tsx),
  [backend/routes/files.js](../../backend/routes/files.js), [docs/README.md](../README.md)
- **Status**: proposed (review only - not implemented)

## Finding

`.vibraryinclude` gates everything: the listing shows only files it matches, and every create/read/save/rename
checks `isVibraryNameIncluded`. In a folder that has no such file (every brand-new folder), the experience is:

- The explorer's empty state correctly explains the situation and tells the user to "Add one with gitignore-style
  patterns" - but the only way to act on that is to leave the app, hand-author a dotfile in a terminal/editor, come
  back, and press Refresh.
- Worse, the app's own affordances dead-end: the sidebar's "+" (Add file) prompts for a name, then the create
  request fails - `POST /files` returns 400 "File name is not included by .vibraryinclude" - because with no
  include file, NOTHING is included. The one button a new user would try cannot succeed in a fresh folder.
- And the file is not documented anywhere: `grep -rn vibraryinclude docs/` matches nothing in `docs/README.md` or
  `docs/editor.md`. The empty-state string is the only documentation of the app's single required piece of
  configuration - `docs/README.md`'s "Running" section implies `vibrary-server` in a folder just works.

## Suggested improvement

- Give the empty state a one-click remedy: a "Create .vibraryinclude" button that writes a starter file (e.g. a
  commented template with `*.xml` or `**/{reviews,specs,tasks,ideas}*.xml`) via a small backend route, then
  refreshes the listing. The empty state keeps its explanation; it just stops being homework.
- Alternatively (smaller): when the include file is missing, let `handleAddFile`'s flow offer to create the include
  entry for the entered name (or auto-create a default include on first file creation, with a notice). Any variant
  removes the guaranteed-400 path.
- Document `.vibraryinclude` in `docs/README.md`: what it is, the pattern syntax (gitignore-style via the `ignore`
  library, `!` re-excludes), one example, and the fact that nothing shows without it.

## Verification

- `node --run lint`, `node --run typecheck`, and `node --run test` pass.
- Manual check: `vibrary-server` in an empty folder - the empty state offers the create action; after one click,
  "+" successfully creates `specs.xml` and the explorer shows it. Docs section renders and matches the shipped
  template.

## Risk

Low. Additive UX on an empty state plus docs; the include-file semantics themselves do not change.
