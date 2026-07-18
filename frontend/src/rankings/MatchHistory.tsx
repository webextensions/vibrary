import { useState } from 'react';

import { type RankingsMatch } from '../api.ts';
import { AccordionSection } from '../shared/AccordionSection.tsx';
import { confirmDialog } from '../shared/confirmDialog.ts';
import { RemoveIcon } from '../shared/Icons.tsx';

import styles from './MatchHistory.module.css';

// The recorded results behind the standings, newest first, with the three grades of discard the feature promises:
// one row, a checkbox selection, or the whole log - each confirmed, each answered by the server with recomputed
// standings (the parent adopts that payload). Records are never edited here, only removed: the log is the source of
// truth the replay ranks from, so "undo a bad verdict" IS discarding its record.
const MatchHistory = function ({ matches, busy, onDiscard }: {
    matches: RankingsMatch[];
    busy: boolean;
    onDiscard: (ids: string[]) => void
}) {
    const [expanded, setExpanded] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(function () {
        return new Set();
    });
    // Which rows' rationale paragraphs are open; AI verdicts carry a judge's paragraph worth reading, but always
    // showing every rationale would bury the log.
    const [openRationales, setOpenRationales] = useState<Set<string>>(function () {
        return new Set();
    });

    // Selection pruned to the ids that still exist, so a discard (or an outside refresh) cannot leave ghost
    // selections that would make "Discard selected (N)" lie about what it will remove.
    const currentIds = new Set(matches.map(function (match) { return match.id; }));
    const liveSelection = [...selected].filter(function (id) { return currentIds.has(id); });

    const ordered = matches.toSorted(function (a, b) {
        return b.playedAt.localeCompare(a.playedAt);
    });

    const toggleInSet = function (setState: (updater: (previous: Set<string>) => Set<string>) => void, id: string) {
        setState(function (previous) {
            const next = new Set(previous);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const confirmAndDiscard = async function (ids: string[], message: string) {
        if (await confirmDialog(message, 'Discard')) {
            onDiscard(ids);
        }
    };

    return (
        <AccordionSection
            title="Match history"
            expanded={expanded}
            onToggle={function () {
                setExpanded(function (previous) { return !previous; });
            }}
            badge={<span className={styles.countBadge}>{matches.length}</span>}
        >
            {matches.length === 0 && <p className={styles.emptyState}>No results recorded yet.</p>}

            {matches.length > 0 &&
            <ul className={styles.historyList}>
                {ordered.map(function (match) {
                    const loser = match.winnerTitle === match.firstTitle ? match.secondTitle : match.firstTitle;
                    return (
                        <li key={match.id} className={styles.historyRow}>
                            <div className={styles.rowMain}>
                                <input
                                    type="checkbox"
                                    className={styles.rowCheckbox}
                                    aria-label={`Select result: ${match.winnerTitle} over ${loser}`}
                                    checked={selected.has(match.id)}
                                    onChange={function () {
                                        toggleInSet(setSelected, match.id);
                                    }}
                                />
                                <div className={styles.rowText}>
                                    <span className={styles.verdict}>
                                        <strong>{match.winnerTitle}</strong> over {loser}
                                    </span>
                                    <span className={styles.rowMeta}>
                                        <span className={match.judge === 'AI' ? styles.judgeAi : styles.judgeHuman}>{match.judge}</span>
                                        {' '}
                                        {new Date(match.playedAt).toLocaleString()}
                                    </span>
                                    {match.orphanedTitles.length > 0 &&
                                    <span className={styles.orphanFlag}>
                                        {`No entry is titled ${match.orphanedTitles.map(function (title) { return `"${title}"`; }).join(', ')} - this result sits out of the standings until repaired or discarded.`}
                                    </span>}
                                    {match.rationale !== '' &&
                                    <button
                                        type="button"
                                        className={styles.rationaleToggle}
                                        aria-expanded={openRationales.has(match.id)}
                                        onClick={function () {
                                            toggleInSet(setOpenRationales, match.id);
                                        }}
                                    >
                                        {openRationales.has(match.id) ? 'Hide rationale' : 'Show rationale'}
                                    </button>}
                                    {match.rationale !== '' && openRationales.has(match.id) &&
                                    <p className={styles.rationale}>{match.rationale}</p>}
                                </div>
                                <button
                                    type="button"
                                    className={styles.discardButton}
                                    aria-label={`Discard result: ${match.winnerTitle} over ${loser}`}
                                    title="Discard this result"
                                    disabled={busy}
                                    onClick={function () {
                                        void confirmAndDiscard([match.id], `Discard this result (${match.winnerTitle} over ${loser})? The standings recompute without it.`);
                                    }}
                                >
                                    <RemoveIcon />
                                </button>
                            </div>
                        </li>
                    );
                })}
            </ul>}

            {matches.length > 0 &&
            <div className={styles.footerActions}>
                {liveSelection.length > 0 &&
                <button
                    type="button"
                    className={styles.footerButton}
                    disabled={busy}
                    onClick={function () {
                        void confirmAndDiscard(liveSelection, `Discard ${liveSelection.length} selected result${liveSelection.length === 1 ? '' : 's'}? The standings recompute without them.`);
                    }}
                >
                    Discard selected ({liveSelection.length})
                </button>}
                <button
                    type="button"
                    className={styles.footerButton}
                    disabled={busy}
                    onClick={function () {
                        void confirmAndDiscard(matches.map(function (match) { return match.id; }), `Discard all ${matches.length} recorded results? Every entry returns to the 1500 base rating.`);
                    }}
                >
                    Discard all
                </button>
            </div>}
        </AccordionSection>
    );
};

export { MatchHistory };
