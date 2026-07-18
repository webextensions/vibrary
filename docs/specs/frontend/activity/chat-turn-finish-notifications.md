# Chat-turn finish notifications

`ActivityNotifier` ([frontend/src/activity/ActivityNotifier.tsx](../../../frontend/src/activity/ActivityNotifier.tsx))
keys its finish-toast guard on the job's `endedAt` timestamp rather than on the job id, so every turn of a chat
continuation toasts its completion or failure - not just the first.

## Why

A chat follow-up re-runs the SAME job: `armNextTurn` in the activity queue provider flips the finished job back to
`queued` under its existing id, resetting `endedAt` to `null`, and the next finish stamps a fresh `endedAt`. The old
per-id guard ("toast at most once per job id") therefore silenced the second and every later turn - including
failures, which the notifier exists to surface because a failed run otherwise looks identical to "still working"
unless the monitor is open.

## Behavior contract

- Finish toasts fire once per RUN: the guard stores `job id -> endedAt of the last toasted finish` and toasts whenever
  a finished job's `endedAt` differs from the stored one.
- Start toasts stay once per job id: re-toasting "started" for every follow-up the user just sent themselves would be
  noise; the finish side is the half with a real cost to silence.
- The per-kind enablement from settings applies unchanged - a chat turn keeps its job's original kind (for example
  `run-task`).
- The cleanup pass that forgets ids no longer in the queue works on the map exactly as it did on the set; a dropped
  job's id can never return because a retry mints a new one.
