import cx from 'classnames';
import { useEffect, useRef, useState } from 'react';
import type { MultiValue } from 'react-select';
import Select from 'react-select';

import { type Job, type JobKind, type JobStatus, useActivityQueueActions, useActivityQueueState } from './activityQueue.ts';
import { useSettings } from '../settings/settingsContext.ts';
import { useDismissablePopup } from '../shared/useDismissablePopup.ts';
import { FINISHED_STATUSES, jobElapsed, KIND_META, STATUS_LABEL } from './activityPresentation.ts';
import { ChevronIcon, FilterIcon, PauseIcon, PlayIcon, RefreshIcon, RemoveIcon, SettingsIcon, StopIcon } from '../shared/Icons.tsx';

import styles from './ActivityMonitor.module.css';

type Option = { value: string; label: string };

// One filter option per job kind/status, mirroring SpecsEditor's FILTER_OPTIONS/TYPE_FILTER_OPTIONS pattern - the
// option value is the kind/status itself, so a selection maps straight back for filtering.
const KIND_FILTER_OPTIONS: Option[] = (Object.keys(KIND_META) as JobKind[]).map(function (kind) {
    return { value: kind, label: KIND_META[kind].label };
});
const STATUS_FILTER_OPTIONS: Option[] = (Object.keys(STATUS_LABEL) as JobStatus[]).map(function (status) {
    return { value: status, label: STATUS_LABEL[status] };
});

type JobRowProperties = {
    job: Job;
    now: number;
    onOpen: (id: string, label: string) => void;
    onAbort: () => void;
    onRemove: (id: string) => void;
    onMove: (id: string, direction: 'up' | 'down') => void;
    onRetry: (id: string) => void;
    // Whether a queued neighbor actually exists in each direction (computed against the FULL queue) - the buttons
    // mirror moveJob's own guards instead of rendering enabled no-ops at the queue's edges.
    canMoveUp: boolean;
    canMoveDown: boolean;
    // Non-null while a Kind/Status filter hides part of the queue: reordering a list you can only partially see is
    // ambiguous (a "move" would swap with an invisible neighbor and look dead), so both buttons disable with this
    // explanation as their tooltip.
    moveLockedReason: string | null
};

const JobRow = function ({ job, now, onOpen, onAbort, onRemove, onMove, onRetry, canMoveUp, canMoveDown, moveLockedReason }: JobRowProperties) {
    const { label: kindLabel, Icon } = KIND_META[job.kind];
    const canRetry = job.status === 'error' || job.status === 'aborted';

    const elapsed = jobElapsed(job, now);

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
                        <button type="button" className={cx(styles.rowButton, styles.moveUp)} aria-label="Move up" title={moveLockedReason ?? 'Move up'} disabled={moveLockedReason !== null || !canMoveUp} onClick={function () { onMove(job.id, 'up'); }}>
                            <ChevronIcon />
                        </button>
                        <button type="button" className={cx(styles.rowButton, styles.moveDown)} aria-label="Move down" title={moveLockedReason ?? 'Move down'} disabled={moveLockedReason !== null || !canMoveDown} onClick={function () { onMove(job.id, 'down'); }}>
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
                {job.status !== 'queued' && job.status !== 'running' && (
                    <button type="button" className={styles.rowButton} aria-label="Remove" title="Remove" onClick={function () { onRemove(job.id); }}>
                        <RemoveIcon />
                    </button>
                )}
            </div>
        </li>
    );
};

// Gear button + popover for the per-project settings: which activity kinds pop start/finish notifications (the
// toast itself is fired by ActivityNotifier), plus a bulk reset for every task's remembered run options. Closes on an
// outside click or Escape, matching every other popup in the app (Sidebar/TabBar menus, SpecsEditor's
// speed-dial/Operations/Actions popups).
const NotificationSettingsMenu = function () {
    const { isKindEnabled, setKindEnabled, resetNotifications, hasStoredTaskOptions, resetAllTaskOptions, saveError } = useSettings();
    const [open, setOpen] = useState(false);
    const wrapReference = useRef<HTMLDivElement>(null);

    useDismissablePopup(open, function () { setOpen(false); }, wrapReference);

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
                {saveError !== null &&
                <p className={styles.settingsError}>Failed to save settings: {saveError}</p>}
                <p className={styles.settingsHeading}>Notify when an activity starts or finishes</p>
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
                <button type="button" className={styles.settingsReset} onClick={resetNotifications}>
                    Reset to defaults
                </button>

                <p className={cx(styles.settingsHeading, styles.settingsSectionHeading)}>Task run options</p>
                <button
                    type="button"
                    className={styles.settingsReset}
                    onClick={resetAllTaskOptions}
                    disabled={!hasStoredTaskOptions}
                    title={hasStoredTaskOptions ? 'Forget every task\'s remembered run options' : 'No task has remembered options yet'}
                >
                    Reset all task options
                </button>
            </div>}
        </div>
    );
};

// The "Activity monitor" body: a queue-wide control row over the list of jobs (running first as they sit mid-list,
// queued after, finished history above). Reads everything from the shared activity queue.
const ActivityMonitor = function ({ onOpenActivity }: { onOpenActivity: (jobId: string, title: string) => void }) {
    const { jobs, paused } = useActivityQueueState();
    const { pause, resume, abortCurrent, removeJob, moveJob, retryJob, retryAllFailed, clearFinished } = useActivityQueueActions();

    // Kind/status filters for the job list, mirroring SpecsEditor's own filter row - useful once the queue's history
    // accumulates every run/apply/generate/chat-continuation job across a session. An empty selection filters nothing,
    // matching how the editor's own filters treat an empty selection.
    const [showFilters, setShowFilters] = useState(false);
    const [kindFilter, setKindFilter] = useState<Option[]>([]);
    const [statusFilter, setStatusFilter] = useState<Option[]>([]);
    const hasActiveFilter = kindFilter.length > 0 || statusFilter.length > 0;
    const shownJobs = jobs.filter(function (job) {
        const kindMatches = kindFilter.length === 0 || kindFilter.some(function (option) { return option.value === job.kind; });
        const statusMatches = statusFilter.length === 0 || statusFilter.some(function (option) { return option.value === job.status; });
        return kindMatches && statusMatches;
    });

    const running = jobs.find(function (job) {
        return job.status === 'running';
    });
    // Scoped to shownJobs (not the full queue) so Clear/Retry all - and their enabled state - respect an active
    // Kind/Status filter instead of silently acting on jobs the filter is hiding.
    const hasFinished = shownJobs.some(function (job) {
        return FINISHED_STATUSES.has(job.status);
    });
    const hasRetryable = shownJobs.some(function (job) {
        return job.status === 'error' || job.status === 'aborted';
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
                <button
                    type="button"
                    className={styles.control}
                    title={hasActiveFilter ? 'Clear finished jobs matching the current filter' : 'Clear finished jobs'}
                    onClick={function () {
                        clearFinished(shownJobs.map(function (job) { return job.id; }));
                    }}
                    disabled={!hasFinished}
                >
                    <RemoveIcon />
                    Clear
                </button>
                <button
                    type="button"
                    className={styles.control}
                    title={hasActiveFilter ? 'Retry failed/aborted jobs matching the current filter' : 'Retry all failed/aborted jobs'}
                    onClick={function () {
                        retryAllFailed(shownJobs.map(function (job) { return job.id; }));
                    }}
                    disabled={!hasRetryable}
                >
                    <RefreshIcon />
                    Retry all
                </button>
                {jobs.length > 0 &&
                <button
                    type="button"
                    className={cx(styles.control, showFilters && styles.active)}
                    aria-expanded={showFilters}
                    onClick={function () {
                        setShowFilters(function (previous) { return !previous; });
                    }}
                >
                    <span className={styles.filterIconWrap}>
                        <FilterIcon />
                        {hasActiveFilter && <span className={styles.filterDot} />}
                    </span>
                    Filter
                </button>}
                <NotificationSettingsMenu />
            </div>

            {showFilters &&
            <div className={styles.filterRow}>
                <Select<Option, true>
                    classNamePrefix="rs"
                    isMulti
                    placeholder="Kind"
                    aria-label="Filter activity by kind"
                    options={KIND_FILTER_OPTIONS}
                    value={kindFilter}
                    onChange={function (options: MultiValue<Option>) {
                        setKindFilter([...options]);
                    }}
                />
                <Select<Option, true>
                    classNamePrefix="rs"
                    isMulti
                    placeholder="Status"
                    aria-label="Filter activity by status"
                    options={STATUS_FILTER_OPTIONS}
                    value={statusFilter}
                    onChange={function (options: MultiValue<Option>) {
                        setStatusFilter([...options]);
                    }}
                />
            </div>}

            {paused && running && <p className={styles.note}>Paused - will stop after the current job.</p>}

            {jobs.length === 0 &&
            <p className={styles.empty}>No activity yet. Run a task or apply a spec to queue a job.</p>}

            {jobs.length > 0 && shownJobs.length === 0 &&
            <p className={styles.empty}>No jobs match the current filter.</p>}

            {shownJobs.length > 0 &&
            <ul className={styles.jobs}>
                {shownJobs.map(function (job) {
                    // Mirror moveJob's guards (swap only with a QUEUED neighbor in the FULL queue) so the buttons
                    // disable exactly when a click would be a no-op.
                    const fullIndex = jobs.indexOf(job);
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
                            canMoveUp={jobs[fullIndex - 1]?.status === 'queued'}
                            canMoveDown={jobs[fullIndex + 1]?.status === 'queued'}
                            moveLockedReason={hasActiveFilter ? 'Reordering is disabled while a filter is active' : null}
                        />
                    );
                })}
            </ul>}
        </div>
    );
};

export { ActivityMonitor };
