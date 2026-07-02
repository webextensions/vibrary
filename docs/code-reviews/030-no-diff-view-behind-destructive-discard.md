# 030 - Source Control offers irreversible Discard with no way to see what would be discarded

- **Area**: aligning behavior with what a user would reasonably expect
- **Files**: [frontend/src/components/SourceControlPanel.tsx](../../frontend/src/components/SourceControlPanel.tsx),
  [backend/routes/git.js](../../backend/routes/git.js), [backend/utils/runGit.js](../../backend/utils/runGit.js)
- **Status**: proposed (review only - not implemented)

## Finding

The Status section's file rows expose stage/unstage and two destructive actions - "Discard changes" (per file and
per group) and "Delete" for untracked files - each guarded by a confirm that truthfully says "This cannot be
undone." What no part of the app offers is a way to SEE the change being discarded: rows show only a path and a
status letter; they are not clickable, and there is no diff view anywhere in the UI.

So the confirmation asks the user to make an irreversible call on information the app withholds. The natural
workflow it forces: leave the app, run `git diff <path>` in a terminal, come back. Users trained by comparable
panels (VS Code's Source Control, GitHub Desktop) expect clicking a changed file to show its diff - especially here,
where the changed files are often vibrary XML files edited by an AI RUN the user did not perform themselves, making
"what did it actually change?" the single most common question before discarding or staging.

The pieces already exist server-side: `runGit.js` has `diffAsync(cwd, { staged })` (currently used only to feed
commit-message generation), and simple-git's `diff` accepts path arguments, so a per-file variant is a small
parameter addition rather than new machinery.

## Suggested improvement

- Backend: extend the existing diff plumbing to accept an optional path -
  `GET /api/git/diff?path=<p>&staged=<bool>` returning the unified diff text (path validated with the router's
  existing `resolveWithinCwd`, mirroring `validatePaths`).
- Frontend: make each FileRow's main area clickable to open a lightweight read-only diff - the app already has two
  fitting display idioms to choose from: a `ResponsiveDialog` with the `RawXmlView`-style `<pre>` pane, or an
  editor tab like activity detail tabs. Untracked files (no diff) can show the file content instead, which answers
  the same question before "Delete".
- Not in scope: syntax-colored side-by-side diffing; plain unified text is enough to make the destructive actions
  informed.

## Verification

- `node --run lint`, `node --run typecheck`, and `node --run test` pass.
- Manual check: edit a file, open Source Control, click the row - the unified diff appears; discard then proceeds
  as before. A staged file shows its staged diff; an untracked file shows its content.

## Risk

Low-to-medium: it is a small feature rather than a fix, but read-only and additive - no existing flow changes.
