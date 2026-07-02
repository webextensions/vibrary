# 033 - Queue Move up/down: silent no-ops at the edges and misleading under filters

- **Area**: polishing UI/UX (control affordances matching actual behavior)
- **Files**: [frontend/src/components/ActivityMonitor.tsx](../../frontend/src/components/ActivityMonitor.tsx),
  [frontend/src/ActivityQueueProvider.tsx](../../frontend/src/ActivityQueueProvider.tsx)
- **Status**: proposed (review only - not implemented)

## Finding

Each queued row renders "Move up" and "Move down" buttons unconditionally (`JobRow`, ActivityMonitor.tsx ~line 86).
`moveJob` (ActivityQueueProvider.tsx ~line 280) correctly refuses invalid swaps - but the UI never reflects that,
producing two flavors of confusing clicks:

- **Edges.** The first queued job's "Move up" and the last one's "Move down" are permanent no-ops (the neighbor is
  the running job, finished history, or nothing). The buttons render enabled, respond to the click with nothing,
  and give no cue why.
- **Under an active filter.** The monitor renders `shownJobs` (Kind/Status filtered), but `moveJob` swaps within
  the FULL jobs array. With a queued job hidden between two visible ones, clicking "Move down" swaps with the
  HIDDEN neighbor: the visible order does not change, so the click looks dead - it takes repeated clicks to hop
  past invisible jobs, and each hop silently reorders jobs the user cannot see. The adjacent Clear/Retry-all
  controls were deliberately scoped to the filtered view (the code comments on it); the move buttons were not
  given the same thought.

## Suggested improvement

- Disable the buttons when the move cannot happen: compute, per row, whether a queued neighbor exists in the
  direction (the monitor already has the full `jobs` array to derive this), and pass `canMoveUp`/`canMoveDown` to
  `JobRow` - `disabled` + the existing muted styling matches how Abort/Clear/Retry-all already communicate
  unavailability in the same toolbar.
- For the filtered case, the honest smallest fix is to disable both move buttons while a Kind/Status filter is
  active (title: "Reordering is disabled while filtered") - reordering a list you can only partially see is
  ambiguous no matter what the code does. Alternatively hide the buttons under a filter; disabling with a title
  explains itself better.

## Verification

- `node --run lint`, `node --run typecheck`, and `node --run test` pass.
- Manual check: queue three jobs (pause the queue first so they stay queued). The top job's "Move up" and bottom
  job's "Move down" render disabled; middle moves work. Apply a Kind filter that hides one queued job - move
  buttons disable with the explanatory tooltip; clearing the filter re-enables them.

## Risk

Low. `moveJob`'s guards stay as the source of truth; the change only mirrors them in the buttons' disabled state.
