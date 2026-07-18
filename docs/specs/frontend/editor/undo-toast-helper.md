# showUndoToast - the shared Undo-toast helper

`showUndoToast(message, onUndo)`, a module-level helper in
[frontend/src/editor/SpecsEditor.tsx](../../../frontend/src/editor/SpecsEditor.tsx), renders the "message + Undo
button" success toast used by every lossy in-place operation: single-entry remove, bulk delete, broken-reference
cleanup, find & replace, and bulk type change.

## Why

The five operations each carried ~18 byte-identical JSX lines differing only in the message and the restore call.
Beyond the line count, the duplication spread two decisions that should live once:

- The 8-second window (longer than react-toastify's default) - the toast carries the only recovery path, so the user
  needs time to react; previously documented at only one of the five sites.
- The restore-then-close ordering and the read through `specsReference` - the undo callback must restore into the
  LIVE list (see `reinsertEntries`/`restoreEntries`) so edits made while the toast is up survive.

## Scope

Module-level in `SpecsEditor.tsx` (it needs no component state - each undo callback captures what it needs). If other
components ever grow undoable operations, the helper and the two CSS classes it uses can move to `shared/`; as long as
SpecsEditor is the only consumer, same-file scope keeps the dependency graph flat.
