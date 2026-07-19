import { useEffect, useRef, useState } from 'react';

import { type SplitPart, splitSpec } from '../api.ts';
import { ResponsiveDialog } from '../shared/ResponsiveDialog.tsx';

import styles from './SpecsEditor.module.css';

// The Split preview: ask the buffered agent for 2-4 focused parts of one oversized entry, show them for review, and
// insert only the ticked ones (all ticked by default) when the user confirms. Nothing touches the file until Insert:
// the run itself is read-only, so cancelling - or closing mid-run, which aborts the request - costs nothing.
const SplitSpecDialog = function ({ entry, onClose, onInsert }: {
    entry: { title: string; content: string; notes: string };
    onClose: () => void;
    onInsert: (parts: SplitPart[]) => void
}) {
    const [parts, setParts] = useState<SplitPart[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [selected, setSelected] = useState<Set<number>>(function () {
        return new Set();
    });
    // Bumped by Retry to re-run the request effect; the abort controller cancels a still-running split when the
    // dialog closes, so an abandoned dialog never leaves a request pinning the server.
    const [attempt, setAttempt] = useState(0);

    const entryReference = useRef(entry);
    useEffect(function () {
        let isActive = true;
        const controller = new AbortController();
        const load = async function () {
            try {
                const proposed = await splitSpec(entryReference.current, controller.signal);
                if (isActive) {
                    setParts(proposed);
                    setSelected(new Set(proposed.keys()));
                    setError(null);
                }
            } catch (splitError) {
                if (isActive && !controller.signal.aborted) {
                    setError(splitError instanceof Error ? splitError.message : 'The split failed');
                }
            }
        };
        void load();
        return function () {
            isActive = false;
            controller.abort();
        };
    }, [attempt]);

    const toggle = function (index: number) {
        setSelected(function (previous) {
            const next = new Set(previous);
            if (next.has(index)) {
                next.delete(index);
            } else {
                next.add(index);
            }
            return next;
        });
    };

    const chosen = parts === null ? [] : parts.filter(function (_part, index) { return selected.has(index); });

    return (
        <ResponsiveDialog
            open
            onClose={onClose}
            title="Split this entry"
            closable
            draggable
            noPrimaryButton
        >
            <div className={styles.splitBody}>
                {error === null && parts === null &&
                <p className={styles.splitHint}>
                    <span className={styles.aiSpinner} role="status" aria-label="Splitting" /> Proposing focused
                    parts...
                </p>}

                {error !== null &&
                <div className={styles.splitError}>
                    <p>{error}</p>
                    <button
                        type="button"
                        onClick={function () {
                            setError(null);
                            setParts(null);
                            setAttempt(function (previous) { return previous + 1; });
                        }}
                    >
                        Retry
                    </button>
                </div>}

                {parts !== null &&
                <>
                    <p className={styles.splitHint}>
                        The ticked parts are inserted as new unapproved entries right after the original (each
                        relating back to it); the original stays for you to trim or remove.
                    </p>
                    <ul className={styles.splitList}>
                        {parts.map(function (part, index) {
                            return (
                                <li key={part.title} className={styles.splitPart}>
                                    <label className={styles.splitPartHeader}>
                                        <input
                                            type="checkbox"
                                            checked={selected.has(index)}
                                            onChange={function () {
                                                toggle(index);
                                            }}
                                        />
                                        <strong>{part.title}</strong>
                                    </label>
                                    <p className={styles.splitPartContent}>{part.content}</p>
                                    {part.notes !== '' && <p className={styles.splitPartNotes}>{part.notes}</p>}
                                </li>
                            );
                        })}
                    </ul>
                    <div className={styles.splitActions}>
                        <button type="button" onClick={onClose}>Cancel</button>
                        <button
                            type="button"
                            className={styles.splitInsert}
                            disabled={chosen.length === 0}
                            onClick={function () {
                                onInsert(chosen);
                            }}
                        >
                            Insert {chosen.length} {chosen.length === 1 ? 'entry' : 'entries'}
                        </button>
                    </div>
                </>}
            </div>
        </ResponsiveDialog>
    );
};

export { SplitSpecDialog };
