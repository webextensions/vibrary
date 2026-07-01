import cx from 'classnames';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import { type Job, type JobKind, type JobStatus, useActivityQueue } from '../activityQueue.ts';
import { useSettings } from '../settingsContext.ts';
import { AiIcon, ChevronIcon, EditIcon, ListIcon, PauseIcon, PlayIcon, RefreshIcon, RemoveIcon, SettingsIcon, SpecIcon, StopIcon, TaskIcon } from './Icons.tsx';

import styles from './ActivityMonitor.module.css';

// The glyph and human label shown per job kind, so a row reads at a glance which action it is.
const KIND_META: Record<JobKind, { label: string; Icon: () => ReactNode }> = {
    'run-task': { label: 'Run task', Icon: TaskIcon },
    'apply-spec': { label: 'Apply spec', Icon: SpecIcon },
    'apply-batch': { label: 'Apply batch', Icon: ListIcon },
    'generate': { label: 'Generate', Icon: AiIcon },
    'title': { label: 'Title', Icon: EditIcon }
};

// Statuses for a job that has finished running, in one place so the row logic and queue-wide checks agree.
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

type JobRowProperties = {
    job: Job;
    now: number;
    onOpen: (id: string, label: string) => void;
    onAbort: () => void;
    onRemove: (id: string) => void;
    onMove: (id: string, direction: 'up' | 'down') => void;
    onRetry: (id: string) => void
};

const JobRow = function ({ job, now, onOpen, onAbort, onRemove, onMove, onRetry }: JobRowProperties) {
    const { label: kindLabel, Icon } = KIND_META[job.kind];
    const canRetry = job.status === 'error' || job.status === 'aborted';

    // Elapsed: from start to now while running, start to end once finished.
    const elapsed = job.startedAt === null ?
        null :
        formatDuration((job.status === 'running' ? now : (job.endedAt ?? now)) - job.startedAt);

    return (
        <li className={styles.job}>
            <button
                type="button"
                className={styles.jobMain}
                title={`${kindLabel}: ${job.label} - open detail`}
                onClick={function () { onOpen(job.id, job.label || kindLabel); }}
            >
                <span className={cx(styles.kindIcon, styles[job.status])}><Icon /></span>
                <span className={styles.jobLabel}>{job.label || kindLabel}</span>
                <span className={cx(styles.status, styles[job.status])}>{STATUS_LABEL[job.status]}</span>
                {elapsed !== null && <span className={styles.elapsed}>{elapsed}</span>}
            </button>

            <div className={styles.jobActions}>
                {job.status === 'queued' && (
                    <>
                        <button type="button" className={cx(styles.rowButton, styles.moveUp)} aria-label="Move up" title="Move up" onClick={function () { onMove(job.id, 'up'); }}>
                            <ChevronIcon />
                        </button>
                        <button type="button" className={cx(styles.rowButton, styles.moveDown)} aria-label="Move down" title="Move down" onClick={function () { onMove(job.id, 'down'); }}>
                            <ChevronIcon />
                        </button>
                        <button type="button" className={styles.rowButton} aria-label="Remove from queue" title="Remove from queue" onClick={function () { onRemove(job.id); }}>
                            <RemoveIcon />
                        </button>
                    </>
                )}
                {job.status === 'running' && (
                    <button type="button" className={cx(styles.rowButton, styles.danger)} aria-label="Abort" title="Abort" onClick={onAbort}>
                        <StopIcon />
                    </button>
                )}
                {canRetry && (
                    <button type="button" className={styles.rowButton} aria-label="Retry" title="Retry" onClick={function () { onRetry(job.id); }}>
                        <RefreshIcon />
                    </button>
                )}
            </div>
        </li>
    );
};

// Gear button + popover letting the user choose which activity kinds pop a top-level start notification. The choices
// live in the per-project settings; the toast itself is fired by ActivityNotifier. Closes on an outside click.
const NotificationSettingsMenu = function () {
    const { isKindEnabled, setKindEnabled } = useSettings();
    const [open, setOpen] = useState(false);
    const wrapReference = useRef<HTMLDivElement>(null);

    useEffect(function () {
        if (!open) {
            return undefined;
        }
        const handlePointerDown = function (event: MouseEvent) {
            if (wrapReference.current !== null && !wrapReference.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handlePointerDown);
        return function () {
            document.removeEventListener('mousedown', handlePointerDown);
        };
    }, [open]);

    return (
        <div className={styles.settingsWrap} ref={wrapReference}>
            <button
                type="button"
                className={styles.control}
                aria-expanded={open}
                onClick={function () {
                    setOpen(function (previous) {
                        return !previous;
                    });
                }}
            >
                <SettingsIcon />
                Settings
            </button>
            {open &&
            <div className={styles.settingsPanel}>
                <p className={styles.settingsHeading}>Notify when an activity starts</p>
                {(Object.keys(KIND_META) as JobKind[]).map(function (kind) {
                    return (
                        <label key={kind} className={styles.settingsRow}>
                            <input
                                type="checkbox"
                                checked={isKindEnabled(kind)}
                                onChange={function (event) {
                                    setKindEnabled(kind, event.target.checked);
                                }}
                            />
                            {KIND_META[kind].label}
                        </label>
                    );
                })}
            </div>}
        </div>
    );
};

// The "Activity monitor" body: a queue-wide control row over the list of jobs (running first as they sit mid-list,
// queued after, finished history above). Reads everything from the shared activity queue.
const ActivityMonitor = function ({ onOpenActivity }: { onOpenActivity: (jobId: string, title: string) => void }) {
    const { jobs, paused, pause, resume, abortCurrent, removeJob, moveJob, retryJob, clearFinished } = useActivityQueue();

    const running = jobs.find(function (job) {
        return job.status === 'running';
    });
    const hasFinished = jobs.some(function (job) {
        return FINISHED_STATUSES.has(job.status);
    });

    // Re-render once a second while a job runs so the elapsed timer ticks; idle when nothing is running.
    const [now, setNow] = useState<number>(function () {
        return Date.now();
    });
    useEffect(function () {
        if (!running) {
            return undefined;
        }
        const timer = setInterval(function () {
            setNow(Date.now());
        }, 1000);
        return function () {
            clearInterval(timer);
        };
    }, [running]);

    return (
        <div className={styles.monitor}>
            <div className={styles.controls}>
                {paused ?
                    (
                        <button type="button" className={styles.control} onClick={resume}>
                            <PlayIcon />
                            Resume
                        </button>
                    ) :
                    (
                        <button type="button" className={styles.control} onClick={pause}>
                            <PauseIcon />
                            Pause
                        </button>
                    )}
                <button type="button" className={cx(styles.control, styles.danger)} onClick={abortCurrent} disabled={!running}>
                    <StopIcon />
                    Abort
                </button>
                <button type="button" className={styles.control} onClick={clearFinished} disabled={!hasFinished}>
                    <RemoveIcon />
                    Clear
                </button>
                <NotificationSettingsMenu />
            </div>

            {paused && running && <p className={styles.note}>Paused - will stop after the current job.</p>}

            {jobs.length === 0 ?
                (
                    <p className={styles.empty}>No activity yet. Run a task or apply a spec to queue a job.</p>
                ) :
                (
                    <ul className={styles.jobs}>
                        {jobs.map(function (job) {
                            return (
                                <JobRow
                                    key={job.id}
                                    job={job}
                                    now={now}
                                    onOpen={onOpenActivity}
                                    onAbort={abortCurrent}
                                    onRemove={removeJob}
                                    onMove={moveJob}
                                    onRetry={retryJob}
                                />
                            );
                        })}
                    </ul>
                )}
        </div>
    );
};

export { ActivityMonitor, KIND_META };
