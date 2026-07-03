import cx from 'classnames';
import { useEffect, useRef, useState } from 'react';
import { Streamdown } from 'streamdown';

import { useActivityQueueActions, useActivityQueueState, useJobEvents } from './activityQueue.ts';
import { type TranscriptItem } from './activityStream.ts';

import { formatDuration, STATUS_LABEL } from './activityPresentation.ts';
import { ChevronIcon, RefreshIcon, StopIcon } from '../shared/Icons.tsx';

import styles from './ActivityDetail.module.css';

// The initial-prompt bubble shows a concise view by default and the exact prompt sent to claude on demand. The last
// chosen view is persisted (mirroring RawXmlView's line-wrap idiom) so it becomes the default for the next such bubble.
const PROMPT_VIEW_KEY = 'vibrary:prompt-view';
type PromptView = 'summary' | 'full';

const readPromptView = function (): PromptView {
    try {
        return window.localStorage.getItem(PROMPT_VIEW_KEY) === 'full' ? 'full' : 'summary';
    } catch {
        return 'summary';
    }
};

const writePromptView = function (view: PromptView) {
    try {
        window.localStorage.setItem(PROMPT_VIEW_KEY, view);
    } catch {
        // ignore persistence failures; the toggle still works for this session
    }
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

// A user message: the initial prompt or a chat follow-up, as a right-aligned bubble. When the exact prompt is available
// and differs from the concise text, a Summary/Full toggle switches views (its default follows the persisted choice).
// A follow-up still waiting behind an earlier turn (isPending) shows a "Queued" tag and a Cancel button to retract it
// before it is actually sent - once a run picks it up it is no longer pending and this affordance disappears.
const UserMessage = function (
    { text, fullText, isPending, onCancel }:
    { text: string; fullText?: string; isPending: boolean; onCancel: () => void }
) {
    const hasFull = typeof fullText === 'string' && fullText.trim() !== '' && fullText !== text;
    const [view, setView] = useState<PromptView>(readPromptView);
    const shown = hasFull && view === 'full' ? fullText : text;
    const select = function (next: PromptView) {
        setView(next);
        writePromptView(next);
    };
    return (
        <div className={styles.userMessage}>
            {hasFull && (
                <div className={styles.promptTabs}>
                    <button type="button" className={cx(styles.promptTab, view === 'summary' && styles.promptTabActive)} onClick={function () { select('summary'); }}>
                        Summary
                    </button>
                    <button type="button" className={cx(styles.promptTab, view === 'full' && styles.promptTabActive)} onClick={function () { select('full'); }}>
                        Full
                    </button>
                </div>
            )}
            <div className={styles.userText}>{shown}</div>
            {isPending && (
                <div className={styles.pendingRow}>
                    <span className={styles.pendingTag}>Queued</span>
                    <button type="button" className={styles.pendingCancel} onClick={onCancel}>
                        Cancel
                    </button>
                </div>
            )}
        </div>
    );
};

// A chat-style "working" indicator: three bouncing dots shown at the bottom while a reply is streaming or a queued
// follow-up is waiting, signalling that more output is still coming.
const TypingIndicator = function () {
    return (
        <div className={styles.typing} aria-label="Working...">
            <span className={styles.typingDot} />
            <span className={styles.typingDot} />
            <span className={styles.typingDot} />
        </div>
    );
};

const TranscriptBlock = function ({ item, isPending, onCancel }: { item: TranscriptItem; isPending: boolean; onCancel: () => void }) {
    switch (item.kind) {
        case 'user': {
            return <UserMessage text={item.text} fullText={item.fullText} isPending={isPending} onCancel={onCancel} />;
        }
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
    const { jobs } = useActivityQueueState();
    const { abortCurrent, retryJob, sendMessage, cancelPendingMessage, isMessagePending, getDraft, setDraft: storeDraft } = useActivityQueueActions();
    const job = jobs.find(function (candidate) { return candidate.id === jobId; }) ?? null;
    const items = useJobEvents(jobId);

    // Seeded from the provider-held draft and mirrored back on every change: only the active tab is mounted, so local
    // state alone would silently discard a half-typed follow-up on a tab switch - the one piece of user-typed input
    // the app would otherwise forget (file tabs deliberately keep their unsaved edits across switches).
    const [draft, setDraft] = useState<string>(function () { return getDraft(jobId); });
    const updateDraft = function (text: string) {
        setDraft(text);
        storeDraft(jobId, text);
    };
    const isRunning = job?.status === 'running';
    // Active = a reply is streaming, or a follow-up turn is queued behind another run; drives the typing indicator.
    const isActive = job?.status === 'running' || job?.status === 'queued';
    const [now, setNow] = useState<number>(function () { return Date.now(); });
    useEffect(function () {
        if (!isRunning) {
            return undefined;
        }
        const timer = setInterval(function () { setNow(Date.now()); }, 1000);
        return function () { clearInterval(timer); };
    }, [isRunning]);

    // Keep the transcript pinned to the bottom while it is at the bottom (so streaming follows), but leave it alone once
    // the user scrolls up. items' reference changes on every token, so this effect follows the stream smoothly.
    const timelineReference = useRef<HTMLDivElement>(null);
    const stickReference = useRef<boolean>(true);
    const handleScroll = function () {
        const element = timelineReference.current;
        if (element === null) {
            return;
        }
        stickReference.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40;
    };
    useEffect(function () {
        const element = timelineReference.current;
        if (element !== null && stickReference.current) {
            element.scrollTop = element.scrollHeight;
        }
    }, [items, isActive]);

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

    // The chat composer shows once a session id has been captured (early in the run), so a follow-up can be typed and
    // sent even while a reply is still streaming - it queues and auto-sends when the current turn finishes.
    const canContinue = Boolean(job.sessionId);
    const handleSend = function () {
        if (draft.trim() === '') {
            return;
        }
        stickReference.current = true;
        sendMessage(job.id, draft);
        updateDraft('');
    };

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

            <div className={styles.timeline} ref={timelineReference} onScroll={handleScroll}>
                {items.length === 0 ?
                    (
                        <p className={styles.empty}>{isRunning ? 'Waiting for the agent to start...' : 'No streamed activity for this run.'}</p>
                    ) :
                    items.map(function (item) {
                        return (
                            <TranscriptBlock
                                key={item.id}
                                item={item}
                                isPending={item.kind === 'user' && isMessagePending(job.id, item.id)}
                                onCancel={function () { cancelPendingMessage(job.id, item.id); }}
                            />
                        );
                    })}
                {job.error !== null && job.status !== 'aborted' && <p className={styles.error}>{job.error}</p>}
                {isActive && <TypingIndicator />}
            </div>

            {canContinue && (
                <div className={styles.composer}>
                    <textarea
                        className={styles.composerInput}
                        value={draft}
                        placeholder="Continue this activity as a chat... (Ctrl+Enter to send)"
                        rows={2}
                        onChange={function (event) { updateDraft(event.target.value); }}
                        onKeyDown={function (event) {
                            if (event.key !== 'Enter' || (!event.metaKey && !event.ctrlKey)) {
                                return;
                            }
                            event.preventDefault();
                            handleSend();
                        }}
                    />
                    <button type="button" className={styles.action} title="Send (Ctrl+Enter)" disabled={draft.trim() === ''} onClick={handleSend}>
                        Send
                    </button>
                </div>
            )}
        </div>
    );
};

export { ActivityDetail };
