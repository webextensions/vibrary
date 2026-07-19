import cx from 'classnames';
import { useEffect, useRef, useState } from 'react';
import type { MultiValue } from 'react-select';
import Select from 'react-select';

import { type Job, type JobKind, type JobStatus, type JobTarget, useActivityQueueActions, useActivityQueueState } from './activityQueue.ts';
import { useSettingsActions, useSettingsState } from '../settings/settingsContext.ts';
import { randomId } from '../xml/vibraryXml.ts';
import { useDismissablePopup } from '../shared/useDismissablePopup.ts';
import { FINISHED_STATUSES, jobElapsed, KIND_META, STATUS_LABEL } from './activityPresentation.ts';
import { TranscriptHistory } from './TranscriptHistory.tsx';
import { ChevronIcon, ClockIcon, FilterIcon, GoToIcon, PauseIcon, PlayIcon, RefreshIcon, RemoveIcon, SettingsIcon, StopIcon } from '../shared/Icons.tsx';
import { isRateLimitError } from './rateLimit.ts';
import { promptDialog } from '../shared/promptDialog.ts';

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
    // Open the ENTRY the job ran on in the editor (as opposed to onOpen, which opens the job's own detail tab).
    // Rendered only for jobs that carry an entry target, so batch/generate rows show no dead affordance.
    onOpenEntry: (target: JobTarget) => void;
    onAbort: () => void;
    onRemove: (id: string) => void;
    onMove: (id: string, direction: 'up' | 'down') => void;
    onRetry: (id: string) => void;
    // Ask for and set a run-after deferral on a queued job / clear it back to run-at-its-turn.
    onDefer: (id: string) => void;
    onClearDeferral: (id: string) => void;
    // Re-run a rate-limited failure after a cool-off (rides retryJob's runAfter option).
    onRetryLater: (id: string) => void;
    // Whether a queued neighbor actually exists in each direction (computed against the FULL queue) - the buttons
    // mirror moveJob's own guards instead of rendering enabled no-ops at the queue's edges.
    canMoveUp: boolean;
    canMoveDown: boolean;
    // Non-null while a Kind/Status filter hides part of the queue: reordering a list you can only partially see is
    // ambiguous (a "move" would swap with an invisible neighbor and look dead), so both buttons disable with this
    // explanation as their tooltip.
    moveLockedReason: string | null
};

const JobRow = function ({ job, now, onOpen, onOpenEntry, onAbort, onRemove, onMove, onRetry, onDefer, onClearDeferral, onRetryLater, canMoveUp, canMoveDown, moveLockedReason }: JobRowProperties) {
    const { label: kindLabel, Icon } = KIND_META[job.kind];
    const canRetry = job.status === 'error' || job.status === 'aborted';
    // A failure that reads as a rate/usage limit gets a distinctive chip and a delayed-retry affordance: retrying
    // such a run immediately usually just burns another request into the same wall.
    const isRateLimited = job.status === 'error' && isRateLimitError(job.error);
    // A const so the null check below narrows into the click handler's closure.
    const entryTarget = job.target;

    const elapsed = jobElapsed(job, now);
    const isJobDeferred = job.status === 'queued' && job.runAfter !== null && job.runAfter > now;

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
                {isRateLimited &&
                <span className={styles.rateLimited} title={job.error ?? undefined}>rate limited</span>}
                {isJobDeferred && job.runAfter !== null &&
                <span className={styles.elapsed} title={`Starts no earlier than ${new Date(job.runAfter).toLocaleTimeString()}`}>
                    {`>= ${new Date(job.runAfter).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                </span>}
                {elapsed !== null && <span className={styles.elapsed}>{elapsed}</span>}
            </button>

            <div className={styles.jobActions}>
                {entryTarget !== null && (
                    <button type="button" className={styles.rowButton} aria-label="Open entry" title={`Open "${entryTarget.entryTitle}" in the editor`} onClick={function () { onOpenEntry(entryTarget); }}>
                        <GoToIcon />
                    </button>
                )}
                {job.status === 'queued' && (
                    <>
                        {isJobDeferred ?
                            (
                                <button type="button" className={cx(styles.rowButton, styles.deferActive)} aria-label="Clear the deferral" title="Deferred - click to let it run at its turn again" onClick={function () { onClearDeferral(job.id); }}>
                                    <ClockIcon />
                                </button>
                            ) :
                            (
                                <button type="button" className={styles.rowButton} aria-label="Defer this job" title="Start no earlier than... (later jobs may overtake it)" onClick={function () { onDefer(job.id); }}>
                                    <ClockIcon />
                                </button>
                            )}
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
                {isRateLimited && (
                    <button type="button" className={styles.rowButton} aria-label="Retry in 5 minutes" title="Queue a retry that starts no earlier than 5 minutes from now" onClick={function () { onRetryLater(job.id); }}>
                        <ClockIcon />
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

// The AI competition judge's prompt template, editable in place. Mounted only while the settings panel is open, so
// the local editing state seeds from the stored value at open time (the same one-time-seed pattern task options
// use); each keystroke writes through to the debounced settings persist.
const CompetitionPromptEditor = function () {
    const { getCompetitionPrompt, setCompetitionPrompt } = useSettingsActions();
    const [template, setTemplate] = useState(getCompetitionPrompt);
    return (
        <>
            <p className={cx(styles.settingsHeading, styles.settingsSectionHeading)}>AI competition judge prompt</p>
            <textarea
                className={styles.settingsTextarea}
                rows={5}
                placeholder="Leave empty to use the built-in judge prompt."
                aria-label="AI competition judge prompt template"
                value={template}
                onChange={function (event) {
                    setTemplate(event.target.value);
                    setCompetitionPrompt(event.target.value);
                }}
            />
            <p className={styles.settingsHint}>
                Placeholders: {'{{entryA}}'}, {'{{entryB}}'}, {'{{instructions}}'}. The JSON answer format is always
                appended so verdicts stay machine-readable.
            </p>
            <button
                type="button"
                className={styles.settingsReset}
                disabled={template === ''}
                onClick={function () {
                    setTemplate('');
                    setCompetitionPrompt('');
                }}
            >
                Reset to the built-in prompt
            </button>
        </>
    );
};

// The saved prompt-template library, managed in place: a list of the templates (click a name to load it into the
// form for editing, or delete it) over an add/edit form. Saved templates surface as an "Insert saved template"
// picker beside the agent actions' instruction boxes (PromptTemplatePicker).
const PromptTemplateManager = function () {
    const { promptTemplates } = useSettingsState();
    const { savePromptTemplate, deletePromptTemplate } = useSettingsActions();
    // null while adding a new template; a template id while editing that one (the form doubles for both).
    const [editingId, setEditingId] = useState<string | null>(null);
    const [name, setName] = useState('');
    const [text, setText] = useState('');

    const resetForm = function () {
        setEditingId(null);
        setName('');
        setText('');
    };

    return (
        <>
            <p className={cx(styles.settingsHeading, styles.settingsSectionHeading)}>Prompt templates</p>
            <p className={styles.settingsHint}>
                Saved templates appear as an &quot;Insert saved template&quot; picker on the AI actions&apos;
                instruction boxes.
            </p>
            {promptTemplates.map(function (template) {
                return (
                    <div key={template.id} className={styles.settingsTemplateRow}>
                        <button
                            type="button"
                            className={styles.settingsTemplateName}
                            title={`Edit "${template.name}"`}
                            onClick={function () {
                                setEditingId(template.id);
                                setName(template.name);
                                setText(template.text);
                            }}
                        >
                            {template.name}
                        </button>
                        <button
                            type="button"
                            className={styles.settingsTemplateDelete}
                            aria-label={`Delete template "${template.name}"`}
                            title="Delete this template"
                            onClick={function () {
                                deletePromptTemplate(template.id);
                                if (editingId === template.id) {
                                    resetForm();
                                }
                            }}
                        >
                            <RemoveIcon />
                        </button>
                    </div>
                );
            })}
            <input
                type="text"
                className={styles.settingsTextInput}
                placeholder="Template name"
                aria-label="Template name"
                value={name}
                onChange={function (event) {
                    setName(event.target.value);
                }}
            />
            <textarea
                className={styles.settingsTextarea}
                rows={3}
                placeholder="Template text (inserted into the instructions box)"
                aria-label="Template text"
                value={text}
                onChange={function (event) {
                    setText(event.target.value);
                }}
            />
            <div className={styles.settingsTemplateActions}>
                <button
                    type="button"
                    className={styles.settingsReset}
                    disabled={name.trim() === ''}
                    onClick={function () {
                        savePromptTemplate({ id: editingId ?? randomId(), name: name.trim(), text });
                        resetForm();
                    }}
                >
                    {editingId === null ? 'Add template' : 'Save changes'}
                </button>
                {editingId !== null &&
                <button type="button" className={styles.settingsReset} onClick={resetForm}>
                    Cancel edit
                </button>}
            </div>
        </>
    );
};

// Gear button + popover for the per-project settings: which activity kinds pop start/finish notifications (the
// toast itself is fired by ActivityNotifier), plus a bulk reset for every task's remembered run options and the
// competition judge's prompt template. Closes on an outside click or Escape, matching every other popup in the app
// (Sidebar/TabBar menus, SpecsEditor's speed-dial/Operations/Actions popups).
const NotificationSettingsMenu = function () {
    const { isKindEnabled, hasStoredTaskOptions, saveError } = useSettingsState();
    const { setKindEnabled, resetNotifications, resetAllTaskOptions } = useSettingsActions();
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

                <CompetitionPromptEditor />

                <PromptTemplateManager />
            </div>}
        </div>
    );
};

// The "Activity monitor" body: a queue-wide control row over the list of jobs (running first as they sit mid-list,
// queued after, finished history above). Reads everything from the shared activity queue.
const ActivityMonitor = function ({ onOpenActivity, onOpenEntry }: { onOpenActivity: (jobId: string, title: string) => void; onOpenEntry: (target: JobTarget) => void }) {
    const { jobs, paused } = useActivityQueueState();
    const { pause, resume, abortCurrent, removeJob, moveJob, retryJob, retryAllFailed, clearFinished, deferJob, clearDeferral } = useActivityQueueActions();

    // Ask how long to hold a queued job back, in minutes - a plain number prompt rather than a datetime picker: the
    // deferral's whole use is "give me an hour" / "wait for the rate limit window", not calendar scheduling.
    const handleDefer = async function (id: string) {
        const entered = await promptDialog({
            message: 'Start this job no earlier than (minutes from now):',
            placeholder: 'e.g. 30',
            confirmLabel: 'Defer'
        });
        if (entered === null) {
            return;
        }
        const minutes = Number(entered);
        if (!Number.isFinite(minutes) || minutes <= 0) {
            return;
        }
        deferJob(id, Date.now() + Math.round(minutes * 60 * 1000));
    };

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
                            onOpenEntry={onOpenEntry}
                            onAbort={abortCurrent}
                            onRemove={removeJob}
                            onMove={moveJob}
                            onRetry={retryJob}
                            onDefer={function (id) { void handleDefer(id); }}
                            onClearDeferral={clearDeferral}
                            onRetryLater={function (id) { retryJob(id, { runAfter: Date.now() + (5 * 60 * 1000) }); }}
                            canMoveUp={jobs[fullIndex - 1]?.status === 'queued'}
                            canMoveDown={jobs[fullIndex + 1]?.status === 'queued'}
                            moveLockedReason={hasActiveFilter ? 'Reordering is disabled while a filter is active' : null}
                        />
                    );
                })}
            </ul>}

            <TranscriptHistory />
        </div>
    );
};

export { ActivityMonitor };
