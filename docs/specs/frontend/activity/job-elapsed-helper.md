# jobElapsed - the shared job elapsed-time rule

`jobElapsed(job, now)` in [frontend/src/activity/formatDuration.ts](../../../frontend/src/activity/formatDuration.ts)
is the single home for how a job's elapsed time is computed: `null` before the job ever started, live against `now`
while running, final (`endedAt - startedAt`) once finished, with `endedAt ?? now` covering a re-queued chat turn whose
`endedAt` was reset to `null`. The monitor row and the detail header both render it via the re-export in
`activityPresentation.ts`.

## Why

Both components used to compute this with a character-for-character identical expression. The duplication was riskier
than average because the expression encodes a STATE-MACHINE detail of the queue - which timestamps are meaningful in
which status - so any queue change (a paused state freezing the clock, a queued job gaining a meaningful `startedAt`)
had to find both copies, and a missed one keeps rendering a silently wrong timer.

## Placement

The helper lives in `formatDuration.ts`, not `activityPresentation.ts`, following that module's existing rule: it
stays free of the React-icon imports so it remains unit-testable under plain node (`import type { Job }` is erased at
type-strip time). `activityPresentation.ts` re-exports it as part of the shared presentation vocabulary.

## Tests

[frontend/src/activity/formatDuration.test.ts](../../../frontend/src/activity/formatDuration.test.ts) pins all four
states: never started, running, finished, and the re-queued chat turn fallback.
