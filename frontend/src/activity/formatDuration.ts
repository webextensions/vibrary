import type { Job } from './activityQueue.ts';

// mm:ss for an elapsed span; the running job ticks live, finished jobs show their final duration. Kept in its own
// module (free of the React-icon imports in activityPresentation) so it stays unit-testable under plain node.
const formatDuration = function (milliseconds: number): string {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

// A job's elapsed time - live against `now` while running, final once finished - or null before it ever started.
// Shared by the monitor row and the detail header because it encodes a state-machine detail of the queue (which
// timestamps are meaningful in which status): the `endedAt ?? now` fallback covers a re-queued chat turn, whose
// endedAt is reset to null while it waits to run again.
const jobElapsed = function (job: Job, now: number): string | null {
    if (job.startedAt === null) {
        return null;
    }
    return formatDuration((job.status === 'running' ? now : (job.endedAt ?? now)) - job.startedAt);
};

export { formatDuration, jobElapsed };
