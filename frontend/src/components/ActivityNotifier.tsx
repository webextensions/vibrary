import { useEffect, useRef } from 'react';
import { toast } from 'react-toastify';

import { useActivityQueueState } from '../activityQueue.ts';
import { useSettings } from '../settingsContext.ts';
import { KIND_META } from './activityPresentation.ts';

// Renders nothing; watches the job queue and pops a top-right toast the moment a job starts running, for the kinds the
// user has enabled in the settings popover. Decoupled from the queue itself: it reads jobs and notification prefs from
// context, so the queue has no toast/settings dependency. Each job id is toasted at most once (tracked in a ref) - the
// effect re-runs on every jobs change, so a queued->running transition fires exactly once.
const ActivityNotifier = function () {
    const { jobs } = useActivityQueueState();
    const { isKindEnabled } = useSettings();
    const notifiedReference = useRef(new Set<string>());

    useEffect(function () {
        for (const job of jobs) {
            if (job.startedAt === null || notifiedReference.current.has(job.id)) {
                continue;
            }
            notifiedReference.current.add(job.id);
            if (isKindEnabled(job.kind)) {
                toast(`${KIND_META[job.kind].label} started: ${job.label}`);
            }
        }
    }, [jobs, isKindEnabled]);

    return null;
};

export { ActivityNotifier };
