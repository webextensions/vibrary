# readStored / writeStored - the guarded localStorage helper

[frontend/src/shared/storage.ts](../../../frontend/src/shared/storage.ts) is the one home for the guarded-localStorage
idiom: `readStored(key, parse, fallback)` and `writeStored(key, value)`, plus `isStoredTrue` for the shared boolean
encoding (`String(flag)` on write, `raw === 'true'` on read - pair it with a `true` fallback for default-on
preferences and `false` for default-off ones).

## Why

localStorage can throw when blocked (private mode, storage policies), so every access must be guarded - a failed or
absent read yields the fallback and a failed write is ignored, meaning the preference simply does not persist in that
session. At least five files hand-rolled that guard (sidebar collapse, sort mode and markdown toggle in `App.tsx`,
panel width in `LeftPanel.tsx`, prompt view in `ActivityDetail.tsx`, wrap toggle in `RawXmlView.tsx`, the open-tabs
map in `sessionTabs.ts`), each with its own paraphrase of the rationale, and nothing enforced the `vibrary:` key
prefix or the boolean encoding.

## Contract

- `parse` runs INSIDE the guard: a parser that throws (`JSON.parse` on a corrupted value) or returns `null` lands on
  the fallback. `sessionTabs.readMap`, whose corrupted-value parse previously threw into an outer caller's try, became
  uniformly safe through this.
- Each call site keeps its own key constant and parse specifics (the number validation in LeftPanel, the shape check
  in sessionTabs, the enum narrowing via `isSortMode`).
- Keys use the `vibrary:` namespace by convention.

Sites with genuinely unusual needs can stay hand-rolled - the helper is for the many sites that are variations of the
same three lines.
