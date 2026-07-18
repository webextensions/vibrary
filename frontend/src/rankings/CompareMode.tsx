import { useEffect, useRef, useState } from 'react';

import { getFile } from '../api.ts';
import { CloseIcon } from '../shared/Icons.tsx';
import { parseVibraryXml, type Spec } from '../xml/vibraryXml.ts';

import styles from './CompareMode.module.css';

// The head-to-head voting surface: the current pairing's two entries with their content, a Wins button each, and the
// arrow keys as the fast path (left/up picks the first card, right/down the second) so a backlog can be triaged in a
// quick keyboard run - the elo-anything interaction that motivated the feature. Skip advances without recording.
const CompareMode = function ({ pairing, locations, busy, onVote, onSkip, onClose }: {
    pairing: [string, string] | null;
    locations: Map<string, { name: string; entryIndex: number }>;
    busy: boolean;
    onVote: (winnerTitle: string) => void;
    onSkip: () => void;
    onClose: () => void
}) {
    // title -> content for the current pairing. Missing while loading; an entry whose file cannot be read/parsed
    // falls back to an explanatory placeholder rather than blocking the vote - the titles alone may be enough.
    const [contents, setContents] = useState<Map<string, string>>(function () {
        return new Map();
    });
    // Parsed entries per file, kept for the whole compare session: voting never edits the files, so one read per
    // distinct file serves every pairing that draws from it.
    const parsedFilesReference = useRef(new Map<string, Spec[]>());

    useEffect(function () {
        if (pairing === null) {
            return;
        }
        let isActive = true;
        const loadContents = async function () {
            const loaded = new Map<string, string>();
            for (const title of pairing) {
                const location = locations.get(title);
                if (location === undefined) {
                    loaded.set(title, '(entry not found)');
                    continue;
                }
                let specs = parsedFilesReference.current.get(location.name);
                if (specs === undefined) {
                    try {
                        specs = parseVibraryXml((await getFile(location.name)).content);
                    } catch {
                        specs = [];
                    }
                    parsedFilesReference.current.set(location.name, specs);
                }
                const entry = specs.find(function (spec) { return spec.title === title; });
                loaded.set(title, entry === undefined || entry.content === '' ? '(no content)' : entry.content);
            }
            if (isActive) {
                setContents(loaded);
            }
        };
        void loadContents();
        return function () {
            isActive = false;
        };
    }, [pairing, locations]);

    // Keyboard focus lands on the container when the mode opens AND after every pairing change: a mouse vote
    // unmounts the clicked Wins button (the new pairing renders fresh cards), which would otherwise drop focus to
    // the body and silently disable the arrow keys mid-run.
    const containerReference = useRef<HTMLDivElement>(null);
    useEffect(function () {
        containerReference.current?.focus();
    }, [pairing]);

    if (pairing === null) {
        return (
            <div className={styles.compare}>
                <p className={styles.hint}>Nothing left to compare right now.</p>
                <button type="button" className={styles.secondaryButton} onClick={onClose}>Close</button>
            </div>
        );
    }

    const handleKeyDown = function (event: React.KeyboardEvent<HTMLDivElement>) {
        if (busy) {
            return;
        }
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
            event.preventDefault();
            onVote(pairing[0]);
        } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
            event.preventDefault();
            onVote(pairing[1]);
        }
    };

    return (
        // The container is the keyboard surface (not a focus trap): it holds real buttons, so Tab still reaches them.
        <div
            ref={containerReference}
            className={styles.compare}
            role="group"
            aria-label="Compare two entries"
            tabIndex={-1}
            onKeyDown={handleKeyDown}
        >
            <div className={styles.compareHeader}>
                <span className={styles.hint}>Which matters more?</span>
                <button type="button" className={styles.iconButton} aria-label="Close compare" title="Close compare" onClick={onClose}>
                    <CloseIcon />
                </button>
            </div>
            {pairing.map(function (title, side) {
                return (
                    <div key={title} className={styles.card}>
                        <span className={styles.cardTitle}>{title}</span>
                        <p className={styles.cardContent}>{contents.get(title) ?? 'Loading...'}</p>
                        <button
                            type="button"
                            className={styles.winsButton}
                            disabled={busy}
                            onClick={function () {
                                onVote(title);
                            }}
                        >
                            {side === 0 ? 'This wins (left arrow)' : 'This wins (right arrow)'}
                        </button>
                    </div>
                );
            })}
            <button type="button" className={styles.secondaryButton} disabled={busy} onClick={onSkip}>
                Skip this pair
            </button>
        </div>
    );
};

export { CompareMode };
