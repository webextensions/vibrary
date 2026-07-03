import { useEffect, useRef } from 'react';
import { toast } from 'react-toastify';

import { useActivityQueueState } from './activityQueue.ts';
import { useSettings } from '../settingsContext.ts';
import { FINISHED_STATUSES, KIND_META } from './activityPresentation.ts';

// Renders nothing; watches the job queue and pops a top-right toast when a job starts and when it finishes, for the
// kinds the user has enabled in the settings popover. Finishing matters MORE than starting: runs last minutes to an
// hour and the workflow is to keep working elsewhere while the queue grinds, so completion - and above all failure,
// which otherwise looks identical to "still working" unless the monitor is open - deserves the active signal (an
// abort stays silent: the user just did it themselves). Decoupled from the queue itself: it reads jobs and
// notification prefs from context, so the queue has no toast/settings dependency. Each transition is toasted at most
// once per job id (tracked in refs; a retry is a fresh job row with a fresh id, so it notifies again) - the effect
// re-runs on every jobs change, so each transition fires exactly once.
const ActivityNotifier = function () {
    const { jobs } = useActivityQueueState();
    const { isKindEnabled } = useSettings();
    const startNotifiedReference = useRef(new Set<string>());
    const finishNotifiedReference = useRef(new Set<string>());

    useEffect(function () {
        for (const job of jobs) {
            const kindLabel = KIND_META[job.kind].label;
            if (job.startedAt !== null && !startNotifiedReference.current.has(job.id)) {
                startNotifiedReference.current.add(job.id);
                if (isKindEnabled(job.kind)) {
                    toast(`${kindLabel} started: ${job.label}`);
                }
            }
            if (FINISHED_STATUSES.has(job.status) && !finishNotifiedReference.current.has(job.id)) {
                finishNotifiedReference.current.add(job.id);
                if (isKindEnabled(job.kind) && job.status !== 'aborted') {
                    if (job.status === 'error') {
                        toast.error(`${kindLabel} failed: ${job.label}`);
                    } else {
                        toast.success(`${kindLabel} finished: ${job.label}`);
                    }
                }
            }
        }
    }, [jobs, isKindEnabled]);

    return null;
};

export { ActivityNotifier };
