# Closed test gaps: stream parser, settings normalization, live counts, highlightText

Four pieces of invariant-carrying frontend logic gained node --test coverage, each within the repo's existing
extract-and-test idiom (no new tooling):

- **streamClaude** ([frontend/src/api.test.ts](../../../frontend/src/api.test.ts)) - the client side of the whole
  agent wire protocol. Beyond the exit-sentinel cases, the suite now pins: a line split across two chunks
  reassembling (and one chunk carrying several lines splitting), a malformed JSON line being skipped without failing
  the run, and a non-OK JSON envelope rejecting with the envelope's message.
- **normalizeSettings** ([frontend/src/settings/settings.test.ts](../../../frontend/src/settings/settings.test.ts)) -
  table cases for every shape the settings file can arrive in: garbage to complete defaults, partial merge over
  defaults with unknown kinds dropped, non-boolean values falling back, non-record task options dropped.
- **countLiveBrokenReferences**
  ([frontend/src/explorer/useFileCounts.test.ts](../../../frontend/src/explorer/useFileCounts.test.ts)) - exported
  from the hook file (it is pure, so node imports the module fine); pins the mirror-the-backend rules: known titles =
  folder-wide saved plus the file's own live titles, and total occurrences rather than distinct targets.
- **splitByMatches** ([frontend/src/shared/splitByMatches.ts](../../../frontend/src/shared/splitByMatches.ts) +
  test) - the matching half of `highlightText`, extracted to a JSX-free module because the test glob covers
  `*.test.ts` only and JSX is not stripped by Node. Pins the empty-needle guard (previously an
  infinite-indexOf-hang risk documented only in a comment), case-insensitive matching with original casing, and
  start/end/adjacent matches. `highlightText.tsx` is now a thin segment-to-`<mark>` renderer.

## Deliberately not covered

The `ActivityQueueProvider` pump is the most invariant-dense untested code in the repo, but testing it honestly means
either a React testing stack (a dependency direction the project avoids) or extracting the queue state machine - a
real refactor that should be its own decision, not a test chore.
