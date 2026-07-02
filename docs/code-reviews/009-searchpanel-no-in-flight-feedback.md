# 009 - SearchPanel gives no visible feedback while a search is in flight

- **Area**: polishing UI/UX (loading states, feedback after user actions)
- **Files**: [frontend/src/components/SearchPanel.tsx](../../frontend/src/components/SearchPanel.tsx)
- **Status**: proposed (review only - not implemented)

## Finding

`SearchPanel` tracks an in-flight flag - `const [searching, setSearching] = useState(false)` - but the only thing it
does with it is suppress the "No matches." message (around line 175):

```tsx
{error === null && searchedQuery !== '' && results.length === 0 && !searching &&
<p className={styles.message}>No matches.</p>}
```

Nothing in the rendered output ever indicates that a search is running. Consequences for the user:

- On a slow search (big workspace, many files), the panel just sits there after the debounce fires - no spinner, no
  "Searching..." - so there is no way to tell "still working" from "found nothing yet" from "I mistyped and nothing
  is happening".
- While a NEW query's search is in flight, the PREVIOUS query's results stay fully rendered with no staleness cue,
  so for a second or two the list actively shows answers to a question the user is no longer asking.

This is out of step with the app's own conventions: `SourceControlPanel` renders `Loading...` for its initial load
and spins its Refresh icon while `loading` is true, the editor's Save button swaps to a spinner, and
`CreateEntriesDialog` shows an `aria-label="Generating"` spinner during its run. Search is the only async surface
with zero in-flight feedback.

## Suggested improvement

Any of the app's existing idioms would fit; the smallest consistent option:

- Render a `Searching...` line (same `styles.message` class the panel already uses for errors and "No matches.")
  while `searching` is true, e.g. between the filter select and the results:
  `{searching && <p className={styles.message}>Searching...</p>}`.
- Optionally dim the stale result list while a newer search is in flight (a `searching` class on
  `styles.resultList` with reduced opacity), so leftover results read as provisional. Purely cosmetic - the message
  line alone resolves the core gap.
- Consider `role="status"` on the message so screen readers announce the transition, matching the spinner usage in
  `CreateEntriesDialog` and `SourceControlPanel`.

## Verification

- `node --run lint`, `node --run typecheck`, and `node --run test` pass.
- Manual check: throttle the backend (e.g. a temporary `setTimeout` in the search route) or search a large folder;
  typing a query shows "Searching..." after the 250 ms debounce, which then resolves into results, "No matches.", or
  the error+Retry state. Existing behaviors (debounce, retry, filter) unchanged.

## Risk

Low. Additive rendering keyed off state that is already maintained correctly (the `finally` block clears it, the
cancellation guard prevents stale sets).
