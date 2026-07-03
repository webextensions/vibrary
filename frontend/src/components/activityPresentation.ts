import type { ReactNode } from 'react';

import { type JobKind, type JobStatus } from '../activityQueue.ts';
import { AiIcon, EditIcon, ListIcon, SpecIcon, TaskIcon } from '../shared/Icons.tsx';

// The activity system's shared presentation vocabulary, in one place so the monitor list, the detail tab, and the
// start toasts can never drift apart (STATUS_LABEL and formatDuration used to be duplicated per component - invisible
// at runtime because the detail pane is a separate lazy chunk carrying its own copy).

// The glyph and human label shown per job kind, so a row reads at a glance which action it is.
const KIND_META: Record<JobKind, { label: string; Icon: () => ReactNode }> = {
    'run-task': { label: 'Run task', Icon: TaskIcon },
    'apply-spec': { label: 'Apply spec', Icon: SpecIcon },
    'apply-batch': { label: 'Apply batch', Icon: ListIcon },
    'generate': { label: 'Generate', Icon: AiIcon },
    'title': { label: 'Title', Icon: EditIcon }
};

// Statuses for a job that has finished running, in one place so row logic and queue-wide checks agree.
const FINISHED_STATUSES = new Set<JobStatus>(['success', 'error', 'aborted']);

const STATUS_LABEL: Record<JobStatus, string> = {
    queued: 'Queued',
    running: 'Running',
    success: 'Done',
    error: 'Failed',
    aborted: 'Aborted'
};

// mm:ss for an elapsed span; the running job ticks live, finished jobs show their final duration.
const formatDuration = function (milliseconds: number): string {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

export { FINISHED_STATUSES, formatDuration, KIND_META, STATUS_LABEL };
