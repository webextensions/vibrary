# 050 - Jobs notify when they START but never when they finish or fail

- **Area**: aligning behavior with user expectations (feedback for long-running actions)
- **Files**: [frontend/src/components/ActivityNotifier.tsx](../../frontend/src/components/ActivityNotifier.tsx),
  [frontend/src/settings.ts](../../frontend/src/settings.ts),
  [frontend/src/components/ActivityMonitor.tsx](../../frontend/src/components/ActivityMonitor.tsx)
- **Status**: proposed (review only - not implemented)

## Finding

`ActivityNotifier` toasts exactly one moment in a job's life: the transition to running
(`job.startedAt !== null`, "Run task started: ..."). Nothing notifies on success, failure, or abort.

That is backwards relative to what the user needs. Starting is the moment they just caused by clicking - the toast
confirms something they already know, seconds after they did it. Finishing is the moment they are waiting for, and
these runs are LONG: apply/generate have 10-minute budgets, run-task and chat a full hour. The intended workflow is
to keep working (other tabs, other apps) while the queue grinds; a queued job can also start long after its click,
making even the start toast arrive when the user is elsewhere. Today the only ways to learn a run finished - or
failed - are polling the Activity monitor or noticing the rail badge decrement. A FAILED run in particular deserves
an active signal; it currently looks identical to "still working" unless the monitor is open.

The settings popover already frames the feature as per-kind "notifications", so the natural user reading ("tell me
about my runs") over-promises what ships (start-only).

## Suggested improvement

- Extend the notifier's effect: it already walks `jobs` on every change with a per-id `Set`; a second set keyed on
  "finish notified" plus a check for `FINISHED_STATUSES` gives completion toasts with the same idempotence pattern.
  Style by outcome: success (`Run task finished: <label>`), error (`failed: <label>` with `toast.error`), abort
  arguably silent (the user did it).
- Reuse the existing per-kind toggles for both moments (small), or split "notify on start" / "notify on finish"
  toggles in the settings popover (better, and the settings shape's normalizer in `settings.ts` was built for
  additive keys - unknown keys default cleanly).
- Optional richer step for backgrounded tabs: the Notifications API (`document.hidden` -> desktop notification,
  falling back to toasts) - a separate, larger decision; the in-app completion toast alone closes most of the gap.

## Verification

- `node --run lint`, `node --run typecheck`, and `node --run test` pass.
- Manual check: queue a title-derive (fast) and an apply (slow); on each completion a toast names the job and
  outcome exactly once (retries toast again for the new job row). Disabling the kind in settings silences it. A
  failed run (kill the claude binary mid-run) toasts as failed.

## Risk

Low. Additive notifier logic behind existing settings machinery; the queue itself is untouched.
