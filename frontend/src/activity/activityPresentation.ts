import type { ReactNode } from 'react';

import { type JobKind, type JobStatus } from './activityQueue.ts';
import { AiIcon, ClickIcon, ListIcon, ReviewIcon, SpecIcon, TaskIcon, TrophyIcon } from '../shared/Icons.tsx';

// The activity system's shared presentation vocabulary, in one place so the monitor list, the detail tab, and the
// start toasts can never drift apart (STATUS_LABEL and formatDuration used to be duplicated per component - invisible
// at runtime because the detail pane is a separate lazy chunk carrying its own copy).

// The glyph and human label shown per job kind, so a row reads at a glance which action it is.
const KIND_META: Record<JobKind, { label: string; Icon: () => ReactNode }> = {
    'run-task': { label: 'Run task', Icon: TaskIcon },
    'apply-spec': { label: 'Apply spec', Icon: SpecIcon },
    'apply-batch': { label: 'Apply batch', Icon: ListIcon },
    'generate': { label: 'Generate', Icon: AiIcon },
    'competitions': { label: 'Competitions', Icon: TrophyIcon },
    'plan-spec': { label: 'Plan spec', Icon: ReviewIcon },
    'quick-run': { label: 'Quick run', Icon: ClickIcon }
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

// formatDuration and jobElapsed live in their own module (kept there so they stay node-testable, free of the icon
// imports above) but are re-exported here so existing importers keep getting them from this shared presentation
// vocabulary.
export { formatDuration, jobElapsed } from './formatDuration.ts';
export { FINISHED_STATUSES, KIND_META, STATUS_LABEL };
