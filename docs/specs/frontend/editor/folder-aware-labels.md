# Folder-aware labels: stop the drift where it starts

Labels are the app's only freeform classifier, and two forces used to actively produce variants (`auth` / `Auth` /
`authentication`): the label input offered NO suggestions (so a user in one file could not see another file's
spelling), and agent generation runs were told to "add relevant labels" with no view of the vocabulary that already
existed. Both are fixed upstream, at the moment prevention is free - per the proposal this came from, which ranked
these two fixes above any after-the-fact cleanup view ("the folder-aware input is what stops it happening again").

## The input's suggestions

- `/api/files-summary` now emits each file's `labels` (unique, first-use order) alongside its titles - computed in the
  same cached parse pass, so the addition costs nothing extra
  ([backend/files/files.js](../../../backend/files/files.js)).
- App derives the folder-wide saved vocabulary from the summaries (memoized like `allTitles`);
  [frontend/src/editor/labelOptions.ts](../../../frontend/src/editor/labelOptions.ts) merges the open file's LIVE
  labels over it - the same live-over-saved treatment `takenTitles` and the broken-reference badge already use - so a
  label typed into one entry is offered on the next without a save.
- The card's `CreatableSelect` gets that list as `options`. Labels stay freeform (a closed vocabulary would mean
  labels nobody invents in the moment); the list is a suggestion, not a gate.

## The generate prompt's vocabulary hint

[backend/files/folderLabels.js](../../../backend/files/folderLabels.js) collects the folder's labels (sorted, unique,
skipping unparseable files) and the generate prompt appends: "The folder already uses these labels: ... Reuse them
where they fit; only coin a new label when none of them applies." Advisory on purpose - a genuinely new topic still
deserves a new label.

The collector is byte-bounded (~4 KiB): the vocabulary is a server-side addition to a prompt whose `MAX_PROMPT_BYTES`
guard measures only the user-supplied text, so an unbounded list could blow the single-argv cap the guard exists to
protect. Sorted-then-truncated keeps the bound deterministic.

## Deliberately not built (yet)

The proposal's Labels management view (folder-wide rename / merge / delete with counts) is cleanup for drift that has
already happened, and needs the folder-wide bulk-mutation route shape that does not exist yet; the proposal itself
said to ship the upstream fixes first if only one part ships.

## Tests

- [backend/files/files.test.js](../../../backend/files/files.test.js) - the summary emits per-file labels (and `[]`
  for label-less and unparseable files).
- [backend/files/agents.test.js](../../../backend/files/agents.test.js) - the generate prompt carries the vocabulary
  hint end to end (route -> collector -> builder, asserted on the echoed `user_prompt` line), and omits it entirely
  for a label-less folder.
- [backend/files/folderLabels.test.js](../../../backend/files/folderLabels.test.js) - sorted/unique collection,
  broken-file tolerance, and the byte bound.
- [frontend/src/editor/labelOptions.test.ts](../../../frontend/src/editor/labelOptions.test.ts) - the saved+live
  merge, unsaved labels appearing immediately, and empty labels never suggested.
