import { type StoredTranscript } from '../api.ts';
import { type ClaudeStreamEvent, emptyTranscript, reduceTranscript, type TranscriptItem } from './activityStream.ts';

import styles from './TranscriptReplay.module.css';

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

// A compact read-only rendering of a persisted run - shared by the Activity monitor's History section and the
// Search panel's transcript results. The history is for reading back what happened, not continuing it, so this
// deliberately stays leaner than the live ActivityDetail (no chat composer, no typewriter).
const TranscriptReplay = function ({ record }: { record: StoredTranscript }) {
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

export { TranscriptReplay };
