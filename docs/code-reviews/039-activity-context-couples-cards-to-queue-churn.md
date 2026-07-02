# 039 - One activity context re-renders every spec card on every queue transition

- **Area**: adopting React best practices (context granularity, memoized values)
- **Files**: [frontend/src/ActivityQueueProvider.tsx](../../frontend/src/ActivityQueueProvider.tsx),
  [frontend/src/activityQueue.ts](../../frontend/src/activityQueue.ts),
  [frontend/src/components/SpecCard.tsx](../../frontend/src/components/SpecCard.tsx),
  [frontend/src/components/RunActionSection.tsx](../../frontend/src/components/RunActionSection.tsx)
- **Status**: proposed (review only - not implemented)

## Finding

The provider exposes everything - volatile state (`jobs`, `paused`, `monitorOpen`) and stable actions (`enqueue`,
`sendMessage`, `subscribeEvents`, ...) - through one context whose value object is rebuilt on every render
(`const value: ActivityQueue = { ... }` with no memoization, ~line 399). Two consequences:

- **Consumers that need only an action re-render on every state change.** `SpecCard` and `RunActionSection` call
  `useActivityQueue()` solely for `enqueue`. Because context updates re-render ALL consumers, every card in the
  open file re-renders whenever any job starts, finishes, is cleared, or the monitor accordion toggles
  (`setMonitorOpen(true)` fires on every enqueue). In an entry-heavy file that is dozens of card subtrees
  (react-select instances included) re-rendered for a queue transition they do not display. The provider was
  carefully designed to keep TOKEN streams out of React state for exactly this reason (transcripts live in refs +
  `useSyncExternalStore`), so coarse job-state churn hitting every card runs against its own architecture.
- **Identity churn in the subscription hook.** `useJobEvents` memoizes `subscribe`/`getSnapshot` on
  `subscribeEvents`/`getEvents`, but those are fresh functions each provider render, so `useSyncExternalStore`
  unsubscribes and resubscribes the open activity tab on every queue state change - harmless but wasted work that
  memoization is supposed to prevent.

## Suggested improvement

- Split the context in two, the standard state/actions pattern: an `ActivityQueueStateContext`
  (`jobs`, `paused`, `monitorOpen`) and an `ActivityQueueActionsContext` (everything callable). The actions object
  is created once (all the functions already close over refs, so they need no dependencies) and memoized with
  `useMemo(..., [])`; cards switch to `useActivityQueueActions()` and stop re-rendering on queue churn. Consumers
  that render state (monitor, notifier, detail, panel badge) keep the state hook.
- Smaller fallback if the split is deemed too wide: wrap the current `value` in `useMemo` keyed on
  `[jobs, paused, monitorOpen]` and wrap the action functions in `useCallback`. This fixes the resubscription churn
  and monitor-toggle over-rendering, though cards still re-render when `jobs` itself changes.

## Verification

- `node --run lint`, `node --run typecheck`, and `node --run test` pass.
- React DevTools profiler (or a temporary render counter in `SpecCard`): open a file with many entries, run a
  title-derive job - before the change every card re-renders at enqueue/start/finish; after, none do. The activity
  tab still streams live and the monitor still updates.

## Risk

Low-to-medium: mechanical but touches every consumer's import; the fallback variant is a one-file change.
