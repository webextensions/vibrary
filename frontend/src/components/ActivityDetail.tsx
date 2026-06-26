import cx from 'classnames';
import { useEffect, useState } from 'react';
import { Streamdown } from 'streamdown';

import { type JobStatus, useActivityQueue, useJobEvents } from '../activityQueue.ts';
import { type TranscriptItem } from '../activityStream.ts';

import { ChevronIcon, RefreshIcon, StopIcon } from './Icons.tsx';

import styles from './ActivityDetail.module.css';

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

// A tool-use card: the tool's name plus its input (pretty-printed json once the turn finalizes, raw partial json while
// it streams in).
const ToolUse = function ({ name, input }: { name: string; input: string }) {
    return (
        <div className={styles.tool}>
            <div className={styles.toolHead}>
                <span className={styles.toolName}>{name}</span>
            </div>
            {input.trim() !== '' && <pre className={styles.toolBody}>{input}</pre>}
        </div>
    );
};

// A tool result, collapsed by default since outputs can be large.
const ToolResult = function ({ content, isError }: { content: string; isError: boolean }) {
    const [open, setOpen] = useState<boolean>(false);
    return (
        <div className={cx(styles.tool, isError && styles.toolError)}>
            <button
                type="button"
                className={cx(styles.toolHead, styles.toolToggle)}
                aria-expanded={open}
                onClick={function () {
                    setOpen(function (previous) { return !previous; });
                }}
            >
                <ChevronIcon />
                <span className={styles.toolName}>{isError ? 'Tool error' : 'Tool result'}</span>
            </button>
            {open && <pre className={styles.toolBody}>{content}</pre>}
        </div>
    );
};

const ResultSummary = function ({ item }: { item: Extract<TranscriptItem, { kind: 'result' }> }) {
    return (
        <div className={cx(styles.result, item.isError && styles.resultError)}>
            <div className={styles.resultHead}>{item.isError ? 'Finished with an error' : 'Finished'}</div>
            {item.text.trim() !== '' && <div className={styles.markdown}><Streamdown>{item.text}</Streamdown></div>}
            <div className={styles.resultMeta}>
                {item.durationMs !== undefined && <span>{Math.round(item.durationMs / 1000)}s</span>}
                {item.numTurns !== undefined && <span>{item.numTurns} turns</span>}
                {item.costUsd !== undefined && <span>${item.costUsd.toFixed(4)}</span>}
            </div>
        </div>
    );
};

const TranscriptBlock = function ({ item }: { item: TranscriptItem }) {
    switch (item.kind) {
        case 'system': {
            const parts = ['Session started'];
            if (item.model) {
                parts.push(item.model);
            }
            if (item.toolCount !== undefined) {
                parts.push(`${item.toolCount} tools`);
            }
            return <div className={styles.system}>{parts.join(' - ')}</div>;
        }
        case 'text': {
            return <div className={styles.markdown}><Streamdown>{item.text}</Streamdown></div>;
        }
        case 'tool_use': {
            return <ToolUse name={item.name} input={item.input} />;
        }
        case 'tool_result': {
            return <ToolResult content={item.content} isError={item.isError} />;
        }
        case 'result': {
            return <ResultSummary item={item} />;
        }
        default: {
            return null;
        }
    }
};

// The activity tab body: a header (label, live status/timer, abort/retry) over the streamed transcript of one job.
// Reads the job's metadata from the queue and its live transcript from useJobEvents (which re-renders only this tab as
// tokens arrive).
const ActivityDetail = function ({ jobId }: { jobId: string }) {
    const { jobs, abortCurrent, retryJob } = useActivityQueue();
    const job = jobs.find(function (candidate) { return candidate.id === jobId; }) ?? null;
    const items = useJobEvents(jobId);

    const isRunning = job?.status === 'running';
    const [now, setNow] = useState<number>(function () { return Date.now(); });
    useEffect(function () {
        if (!isRunning) {
            return undefined;
        }
        const timer = setInterval(function () { setNow(Date.now()); }, 1000);
        return function () { clearInterval(timer); };
    }, [isRunning]);

    if (job === null) {
        return (
            <div className={styles.detail}>
                <p className={styles.empty}>This activity is no longer available.</p>
            </div>
        );
    }

    const elapsed = job.startedAt === null ?
        null :
        formatDuration((job.status === 'running' ? now : (job.endedAt ?? now)) - job.startedAt);

    return (
        <div className={styles.detail}>
            <header className={styles.header}>
                <span className={styles.title} title={job.label}>{job.label || job.kind}</span>
                <span className={cx(styles.status, styles[job.status])}>{STATUS_LABEL[job.status]}</span>
                {elapsed !== null && <span className={styles.elapsed}>{elapsed}</span>}
                <div className={styles.headerActions}>
                    {isRunning && (
                        <button type="button" className={cx(styles.action, styles.danger)} onClick={abortCurrent}>
                            <StopIcon />
                            Abort
                        </button>
                    )}
                    {(job.status === 'error' || job.status === 'aborted') && (
                        <button type="button" className={styles.action} onClick={function () { retryJob(job.id); }}>
                            <RefreshIcon />
                            Retry
                        </button>
                    )}
                </div>
            </header>

            <div className={styles.timeline}>
                {items.length === 0 ?
                    (
                        <p className={styles.empty}>{isRunning ? 'Waiting for the agent to start...' : 'No streamed activity for this run.'}</p>
                    ) :
                    items.map(function (item) {
                        return <TranscriptBlock key={item.id} item={item} />;
                    })}
                {job.error !== null && job.status !== 'aborted' && <p className={styles.error}>{job.error}</p>}
            </div>
        </div>
    );
};

export { ActivityDetail };
