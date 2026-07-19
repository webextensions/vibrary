import { type Job } from './activityQueue.ts';

// The queue's deferral arithmetic, pure so the pump's scheduling decisions are unit-testable: a queued job with a
// future runAfter is skipped (later jobs may overtake it - deferral is "start no earlier than", not a queue
// position), and the earliest such time is when the pump must wake to reconsider.

// Whether a job is queued but sitting out until its run-after time arrives.
const isDeferred = function (job: Job, now: number): boolean {
    return job.status === 'queued' && job.runAfter !== null && job.runAfter > now;
};

// The first queued job that may start NOW (its deferral, if any, has matured), or null when everything queued is
// deferred or nothing is queued.
const selectRunnableJob = function (jobs: Job[], now: number): Job | null {
    return jobs.find(function (job) {
        return job.status === 'queued' && !isDeferred(job, now);
    }) ?? null;
};

// The soonest moment a deferred queued job matures, or null when none is deferred - the pump's wake-up alarm.
const earliestDeferredWake = function (jobs: Job[], now: number): number | null {
    let earliest: number | null = null;
    for (const job of jobs) {
        if (isDeferred(job, now) && job.runAfter !== null && (earliest === null || job.runAfter < earliest)) {
            earliest = job.runAfter;
        }
    }
    return earliest;
};

export { earliestDeferredWake, isDeferred, selectRunnableJob };
