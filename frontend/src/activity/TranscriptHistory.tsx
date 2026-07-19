import { useEffect, useState } from 'react';

import { clearTranscripts, deleteTranscript, getTranscript, listTranscripts, type StoredTranscript, type TranscriptSummary } from '../api.ts';
import { AccordionSection } from '../shared/AccordionSection.tsx';
import { confirmDialog } from '../shared/confirmDialog.ts';
import { RemoveIcon } from '../shared/Icons.tsx';
import { ResponsiveDialog } from '../shared/ResponsiveDialog.tsx';
import { type ClaudeStreamEvent, emptyTranscript, reduceTranscript, type TranscriptItem } from './activityStream.ts';

import styles from './TranscriptHistory.module.css';

// Replay a stored record's raw NDJSON lines through the same reducer the live transcript uses, so history renders
// with the live view's semantics (consolidated messages, per-pairing competition items) rather than a raw log dump.
// Unparseable lines are skipped exactly as the live stream skips them.
const replayLines = function (lines: string[]): TranscriptItem[] {
    let state = emptyTranscript();
    for (const line of lines) {
        try {
            state = reduceTranscript(state, JSON.parse(line) as ClaudeStreamEvent);
        } catch {
            continue;
        }
    }
    return state.items;
};

// A compact read-only rendering of replayed items - the history is for reading back what happened, not continuing
// it, so this deliberately stays leaner than the live ActivityDetail (no chat composer, no typewriter).
const ReplayView = function ({ record }: { record: StoredTranscript }) {
    const items = replayLines(record.lines);
    return (
        <div className={styles.replay}>
            {record.truncated &&
            <p className={styles.replayNote}>This run exceeded the persistence cap; the tail was not stored.</p>}
            {record.error !== null && <p className={styles.replayError}>{record.error}</p>}
            {items.map(function (item) {
                if (item.kind === 'user') {
                    return <p key={item.id} className={styles.replayUser}>{item.fullText ?? item.text}</p>;
                }
                if (item.kind === 'text' || item.kind === 'result') {
                    return <p key={item.id} className={item.kind === 'result' ? styles.replayResult : styles.replayText}>{item.text}</p>;
                }
                if (item.kind === 'tool_use') {
                    return <p key={item.id} className={styles.replayTool}>Tool: {item.name}</p>;
                }
                // Thinking, tool results, and the system banner add little when reading history; keep them as muted
                // one-liners rather than dropping them silently.
                if (item.kind === 'tool_result') {
                    return <p key={item.id} className={styles.replayMuted}>(tool result)</p>;
                }
                if (item.kind === 'thinking') {
                    return <p key={item.id} className={styles.replayMuted}>(thinking)</p>;
                }
                return null;
            })}
            {items.length === 0 && <p className={styles.replayMuted}>This record holds no renderable events.</p>}
        </div>
    );
};

// Outcome chip styling by stored outcome; anything unexpected renders in the neutral success tone.
const OUTCOME_CLASS: Record<string, string> = {
    success: styles.outcomeSuccess,
    error: styles.outcomeError,
    aborted: styles.outcomeAborted
};

// The Activity monitor's History section: persisted transcripts of past runs (surviving server restarts), listed
// newest first from the pure-name index. Loading is deferred until the section is first expanded - the history is
// reference material, not something every monitor open should pay a request for.
const TranscriptHistory = function () {
    const [expanded, setExpanded] = useState(false);
    const [entries, setEntries] = useState<TranscriptSummary[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [openRecord, setOpenRecord] = useState<{ summary: TranscriptSummary; record: StoredTranscript } | null>(null);

    useEffect(function () {
        if (!expanded || entries !== null) {
            return undefined;
        }
        let isActive = true;
        const load = async function () {
            try {
                const listed = await listTranscripts();
                if (isActive) {
                    setEntries(listed);
                    setError(null);
                }
            } catch (loadError) {
                if (isActive) {
                    setError(loadError instanceof Error ? loadError.message : 'Failed to load the history');
                }
            }
        };
        void load();
        return function () {
            isActive = false;
        };
    }, [expanded, entries]);

    const handleOpen = async function (summary: TranscriptSummary) {
        try {
            setOpenRecord({ summary, record: await getTranscript(summary.name) });
        } catch (openError) {
            setError(openError instanceof Error ? openError.message : 'Failed to load the transcript');
        }
    };

    const handleDelete = async function (summary: TranscriptSummary) {
        if (!(await confirmDialog(`Delete the persisted transcript of this ${summary.route} run?`, 'Delete'))) {
            return;
        }
        try {
            await deleteTranscript(summary.name);
            setEntries(function (previous) {
                return previous === null ? previous : previous.filter(function (entry) { return entry.name !== summary.name; });
            });
        } catch (deleteError) {
            setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete the transcript');
        }
    };

    const handleClear = async function () {
        const count = entries?.length ?? 0;
        if (!(await confirmDialog(`Delete all ${count} persisted transcripts?`, 'Delete all'))) {
            return;
        }
        try {
            await clearTranscripts();
            setEntries([]);
        } catch (clearError) {
            setError(clearError instanceof Error ? clearError.message : 'Failed to clear the history');
        }
    };

    return (
        <>
            <AccordionSection
                title="History"
                expanded={expanded}
                onToggle={function () {
                    setExpanded(function (previous) { return !previous; });
                }}
                badge={entries === null ? undefined : <span className={styles.countBadge}>{entries.length}</span>}
            >
                {error !== null && <p className={styles.historyError}>{error}</p>}
                {entries !== null && entries.length === 0 && error === null &&
                <p className={styles.historyEmpty}>No persisted runs yet. Finished agent runs land here and survive restarts.</p>}
                {entries !== null && entries.length > 0 &&
                <>
                    <ul className={styles.historyList}>
                        {entries.map(function (entry) {
                            return (
                                <li key={entry.name} className={styles.historyRow}>
                                    <button
                                        type="button"
                                        className={styles.historyOpen}
                                        title="Open this run's persisted transcript"
                                        onClick={function () {
                                            void handleOpen(entry);
                                        }}
                                    >
                                        <span className={OUTCOME_CLASS[entry.outcome] ?? styles.outcomeSuccess}>{entry.outcome}</span>
                                        <span className={styles.historyRoute}>{entry.route}</span>
                                        <span className={styles.historyTime}>{new Date(entry.startedAt).toLocaleString()}</span>
                                    </button>
                                    <button
                                        type="button"
                                        className={styles.historyDelete}
                                        aria-label={`Delete the ${entry.route} transcript from ${entry.startedAt}`}
                                        title="Delete this transcript"
                                        onClick={function () {
                                            void handleDelete(entry);
                                        }}
                                    >
                                        <RemoveIcon />
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                    <button type="button" className={styles.clearAll} onClick={function () { void handleClear(); }}>
                        Clear history
                    </button>
                </>}
            </AccordionSection>

            {openRecord !== null &&
            <ResponsiveDialog
                open
                onClose={function () {
                    setOpenRecord(null);
                }}
                title={`${openRecord.summary.route} - ${new Date(openRecord.summary.startedAt).toLocaleString()}`}
                closable
                draggable
                noPrimaryButton
            >
                <ReplayView record={openRecord.record} />
            </ResponsiveDialog>}
        </>
    );
};

export { TranscriptHistory };
