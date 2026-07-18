import { useEffect, useRef } from 'react';
import { toast } from 'react-toastify';

import { useActivityQueueState } from './activityQueue.ts';
import { useSettingsState } from '../settings/settingsContext.ts';
import { FINISHED_STATUSES, KIND_META } from './activityPresentation.ts';

// Renders nothing; watches the job queue and pops a top-right toast when a job starts and when it finishes, for the
// kinds the user has enabled in the settings popover. Finishing matters MORE than starting: runs last minutes to an
// hour and the workflow is to keep working elsewhere while the queue grinds, so completion - and above all failure,
// which otherwise looks identical to "still working" unless the monitor is open - deserves the active signal (an
// abort stays silent: the user just did it themselves). Decoupled from the queue itself: it reads jobs and
// notification prefs from context, so the queue has no toast/settings dependency. Starts are toasted at most once per
// job id (tracked in a ref; a retry is a fresh job row with a fresh id, so it notifies again). Finishes are keyed on
// the job's endedAt rather than its id, because a chat follow-up re-runs the SAME job (armNextTurn resets endedAt to
// null and the next finish stamps a fresh one) - per-id tracking would silence every turn after the first, including
// failures. The effect re-runs on every jobs change, so each transition fires exactly once.
const ActivityNotifier = function () {
    const { jobs } = useActivityQueueState();
    const { isKindEnabled } = useSettingsState();
    const startNotifiedReference = useRef(new Set<string>());
    const finishNotifiedReference = useRef(new Map<string, number>()); // job id -> endedAt of the last toasted finish

    useEffect(function () {
        for (const job of jobs) {
            const kindLabel = KIND_META[job.kind].label;
            if (job.startedAt !== null && !startNotifiedReference.current.has(job.id)) {
                startNotifiedReference.current.add(job.id);
                if (isKindEnabled(job.kind)) {
                    toast(`${kindLabel} started: ${job.label}`);
                }
            }
            if (FINISHED_STATUSES.has(job.status) && job.endedAt !== null && finishNotifiedReference.current.get(job.id) !== job.endedAt) {
                finishNotifiedReference.current.set(job.id, job.endedAt);
                if (isKindEnabled(job.kind) && job.status !== 'aborted') {
                    if (job.status === 'error') {
                        toast.error(`${kindLabel} failed: ${job.label}`);
                    } else {
                        toast.success(`${kindLabel} finished: ${job.label}`);
                    }
                }
            }
        }

        // Forget ids no longer in the queue (cleared/removed jobs) so the trackers do not grow without bound over a
        // long session of hundreds of runs. Safe because a dropped job's id can never return - a retry mints a new one.
        const liveIds = new Set(jobs.map(function (job) { return job.id; }));
        startNotifiedReference.current = new Set([...startNotifiedReference.current].filter(function (id) { return liveIds.has(id); }));
        finishNotifiedReference.current = new Map([...finishNotifiedReference.current].filter(function ([id]) { return liveIds.has(id); }));
    }, [jobs, isKindEnabled]);

    return null;
};

export { ActivityNotifier };
