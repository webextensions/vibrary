# 044 - One sticky, contextless error banner serves eight unrelated flows

- **Area**: polishing UI/UX (error states, feedback after user actions)
- **Files**: [frontend/src/App.tsx](../../frontend/src/App.tsx)
- **Status**: proposed (review only - not implemented)

## Finding

`loadError` is a single string state with EIGHT producers - the initial load, sidebar Refresh, Add file, node
Delete, bulk Delete, Rename, Duplicate, and New-file-in-folder - and one consumer: a bare paragraph above the
editor (line 644):

```tsx
{loadError !== null && <p className={cx(styles.err, styles.parseError)}>{loadError}</p>}
```

Three consequences for the user:

- **No context.** The banner shows the raw server message with no verb attached. After a failed duplicate it reads
  just "A file with the new name already exists" - nothing says WHICH action failed or on which file; after a
  background title-index refresh failure it might show a network error unrelated to anything the user just did.
  The state's own comment says it is for "loading the file list or titles", but most producers are file mutations.
- **No dismissal.** There is no close affordance and no timeout. The message sits above the editor until some
  OTHER operation from the same set happens to succeed (each success path resets it to null) - a failed rename's
  banner can outlive minutes of unrelated editing.
- **Last-writer-wins.** Two failures in a row (e.g. a bulk delete that partly failed, then a refresh failure)
  leave only the second message; the first is silently replaced.

The app already has better idioms for action feedback: SearchPanel pairs its error with a Retry button,
SourceControlPanel separates `loadError` (empty state) from `actionError`+`notice` (action feedback), and toasts
exist for transient notices.

## Suggested improvement

- Prefix messages with their action at the call sites - `Failed to rename "docs/specs-x.xml": <server message>` -
  a one-line change per producer that fixes the worst gap (context) without touching the rendering.
- Add a dismiss button to the banner (an X reusing the existing CloseIcon), so a stale error does not require a
  successful operation to clear. Setting `loadError` to null on dismissal is the whole implementation.
- Optional, if a bigger step is wanted: split "the file list failed to load" (a persistent empty-state concern,
  like SourceControlPanel's `loadError`) from per-action failures (better as toasts, which self-expire and can
  stack) - this also removes the last-writer-wins loss.

## Verification

- `node --run lint`, `node --run typecheck`, and `node --run test` pass.
- Manual check: duplicate a file to an existing name - the banner names the action and both file names, and the X
  dismisses it; a subsequent successful refresh still clears it automatically.

## Risk

Low. Message-string and small-markup changes; state flow is unchanged unless the optional split is taken.
