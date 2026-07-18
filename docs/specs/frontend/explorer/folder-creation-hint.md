# Folder creation: surface the slash, not a New-folder button

The explorer renders folders (the tree, folders-first sorting, Collapse all) but offered no way to make one - the only
route was knowing to type a slash into a new file's name. The create dialogs now say so: "Use a slash to file it in a
folder, e.g. docs/specs-api.xml" (and the folder-scoped New File prompt notes a slash creates deeper folders).

## Why a hint and not a button

Folders have no on-disk entity of their own - "only folders that lead to a file appear" in the tree, and the backend
derives them from file paths. A **New folder** button would promise something the model cannot deliver (an empty
directory would simply not appear) and would have to fake it with UI-only state that vanishes on refresh. The create
route already `mkdir -p`s intermediate directories; the hint reveals the existing mechanism honestly, exactly as the
proposal's own analysis concluded ("the second option is probably the right one").

The behavior is now pinned as a documented affordance:
[backend/files/files.test.js](../../../backend/files/files.test.js) asserts a slashed create makes the folders and
the nested file is included, listed, and readable (a slashless `.vibraryinclude` pattern matches at every depth, so
the default include template keeps nested files visible).

## Deliberately not built

- **Drag a file onto a folder to move it** - it pairs with the drag-and-drop-reordering proposal (skipped), and doing
  it safely needs an include-gate preflight ("would this name be included?") so a drop that `.vibraryinclude` would
  refuse is not offered; that check does not exist yet and is a design of its own.
- **A per-file-outcome folder rename route** - today's folder rename issues sequential renames that stop at the first
  failure; the transactional-reporting version is the folder-wide-bulk-operations route shape, not yet designed.
