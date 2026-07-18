import { useCallback, useEffect, useState } from 'react';

import { discardMatches, getFilesSummary, getRankings, type RankingsPayload, recordManualMatch } from '../api.ts';
import { announce } from '../shared/announcer.ts';
import { RefreshIcon } from '../shared/Icons.tsx';
import { CompareMode } from './CompareMode.tsx';
import { MatchHistory } from './MatchHistory.tsx';

import styles from './RankingsPanel.module.css';

// Where each title lives (file + index within the file's parsed entries), so a standings row can jump to its entry
// exactly like a search result does. First occurrence wins, matching the folder-wide title-resolution rule.
type EntryLocation = { name: string; entryIndex: number };

// The standings plus the title locations, fetched together: the locations come from the same summary the sidebar
// badges use, so a standings row always agrees with the explorer about which file its entry is in.
const fetchRankingsView = async function (): Promise<{ rankings: RankingsPayload; located: Map<string, EntryLocation> }> {
    const [rankings, summary] = await Promise.all([getRankings(), getFilesSummary()]);
    const located = new Map<string, EntryLocation>();
    for (const file of summary.files) {
        for (const [entryIndex, title] of file.titles.entries()) {
            if (!located.has(title)) {
                located.set(title, { name: file.name, entryIndex });
            }
        }
    }
    return { rankings, located };
};

// The Elo standings over the folder's idea entries (see docs/rankings.md). This panel is the feature's home: the
// standings table now, with the head-to-head compare mode, the match history, and the AI competition runs layering
// onto it in later slices. Ratings are replayed server-side from the recorded matches, so this view is read-only
// plumbing: fetch, render, refresh.
const RankingsPanel = function ({ onOpenEntry }: { onOpenEntry: (name: string, title: string, entryIndex: number) => void }) {
    const [payload, setPayload] = useState<RankingsPayload | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [locations, setLocations] = useState<Map<string, EntryLocation>>(function () {
        return new Map();
    });
    // Compare mode: which suggested pairing is on deck (Skip advances through the server's least-met suggestions,
    // wrapping) and whether a vote is in flight. A recorded vote replaces the whole payload with the server's
    // recomputed answer - fresh standings AND fresh suggestions - so the index resets to the new best pairing.
    const [comparing, setComparing] = useState(false);
    const [suggestionIndex, setSuggestionIndex] = useState(0);
    const [voting, setVoting] = useState(false);

    const load = useCallback(async function () {
        try {
            const { rankings, located } = await fetchRankingsView();
            setPayload(rankings);
            setLocations(located);
            setError(null);
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'Failed to load rankings');
        } finally {
            setLoading(false);
        }
    }, []);

    // Load once when the view is shown. Done inline (not via `load`) so no state is set synchronously in the effect
    // body, mirroring SourceControlPanel's mount load; `loading` already starts true.
    useEffect(function () {
        let isActive = true;
        const loadInitial = async function () {
            try {
                const { rankings, located } = await fetchRankingsView();
                if (isActive) {
                    setPayload(rankings);
                    setLocations(located);
                    setError(null);
                }
            } catch (loadError) {
                if (isActive) {
                    setError(loadError instanceof Error ? loadError.message : 'Failed to load rankings');
                }
            } finally {
                if (isActive) {
                    setLoading(false);
                }
            }
        };
        void loadInitial();
        return function () {
            isActive = false;
        };
    }, []);

    // A vote records the pairing exactly as presented (first vs second) with the chosen winner, then adopts the
    // server's recomputed payload so the standings and the next suggestions update in the same render.
    const handleVote = useCallback(async function (pairing: [string, string], winnerTitle: string) {
        setVoting(true);
        try {
            const result = await recordManualMatch({ firstTitle: pairing[0], secondTitle: pairing[1], winnerTitle });
            setPayload(result);
            setSuggestionIndex(0);
            setError(null);
            const loser = winnerTitle === pairing[0] ? pairing[1] : pairing[0];
            announce(`Recorded: ${winnerTitle} over ${loser}`);
        } catch (voteError) {
            setError(voteError instanceof Error ? voteError.message : 'Failed to record the result');
        } finally {
            setVoting(false);
        }
    }, []);

    // Discard is already confirmed by MatchHistory; this adopts the server's recomputed payload, exactly like a vote.
    const handleDiscard = useCallback(async function (ids: string[]) {
        setVoting(true);
        try {
            const result = await discardMatches(ids);
            setPayload(result);
            setSuggestionIndex(0);
            setError(null);
            announce(`Discarded ${result.removed} result${result.removed === 1 ? '' : 's'}`);
        } catch (discardError) {
            setError(discardError instanceof Error ? discardError.message : 'Failed to discard results');
        } finally {
            setVoting(false);
        }
    }, []);

    const hasMatches = payload !== null && payload.matches.length > 0;
    const suggestions = payload === null ? [] : payload.suggestedPairings;
    const currentPairing = suggestions.length === 0 ? null : suggestions[suggestionIndex % suggestions.length];

    return (
        <div className={styles.rankingsPanel}>
            <div className={styles.headerRow}>
                <h2 className={styles.heading}>Rankings</h2>
                <div className={styles.headerActions}>
                    {payload !== null && payload.standings.length >= 2 && !comparing &&
                    <button
                        type="button"
                        className={styles.compareButton}
                        onClick={function () {
                            setSuggestionIndex(0);
                            setComparing(true);
                        }}
                    >
                        Compare
                    </button>}
                    <button
                        type="button"
                        className={styles.iconButton}
                        aria-label="Refresh rankings"
                        title="Refresh rankings"
                        onClick={function () {
                            void load();
                        }}
                    >
                        <RefreshIcon />
                    </button>
                </div>
            </div>

            {comparing && payload !== null &&
            <CompareMode
                pairing={currentPairing}
                locations={locations}
                busy={voting}
                onVote={function (winnerTitle) {
                    if (currentPairing !== null) {
                        void handleVote(currentPairing, winnerTitle);
                    }
                }}
                onSkip={function () {
                    setSuggestionIndex(function (index) {
                        return index + 1;
                    });
                }}
                onClose={function () {
                    setComparing(false);
                }}
            />}

            {error !== null &&
            <div className={styles.errorBox} role="alert">
                {error}
                <button
                    type="button"
                    className={styles.retryButton}
                    onClick={function () {
                        void load();
                    }}
                >
                    Retry
                </button>
            </div>}

            {error === null && payload !== null && payload.standings.length === 0 &&
            <p className={styles.emptyState}>
                No idea entries to rank yet. Add entries of type &quot;idea&quot; to a vibrary file, then record
                head-to-head comparisons here to build an Elo-ranked backlog.
            </p>}

            {error === null && payload !== null && payload.standings.length > 0 &&
            <>
                {!hasMatches &&
                <p className={styles.hint}>
                    Every idea starts at 1500. Record comparisons to separate the field.
                </p>}
                <ol className={styles.standings}>
                    {payload.standings.map(function (row, index) {
                        const location = locations.get(row.title);
                        return (
                            <li key={row.title} className={styles.standingRow}>
                                <span className={styles.rank}>{index + 1}</span>
                                <div className={styles.titleCell}>
                                    <button
                                        type="button"
                                        className={styles.titleButton}
                                        disabled={location === undefined}
                                        title={location === undefined ? 'Entry not found in the folder' : `Open ${row.title} (${location.name})`}
                                        onClick={function () {
                                            if (location !== undefined) {
                                                onOpenEntry(location.name, row.title, location.entryIndex);
                                            }
                                        }}
                                    >
                                        {row.title}
                                    </button>
                                    <span className={styles.record}>
                                        {row.games === 0 ? 'no games yet' : `${row.wins}W ${row.losses}L in ${row.games}`}
                                    </span>
                                </div>
                                <span className={styles.rating}>{row.rating}</span>
                            </li>
                        );
                    })}
                </ol>
                <MatchHistory
                    matches={payload.matches}
                    busy={voting}
                    onDiscard={function (ids) {
                        void handleDiscard(ids);
                    }}
                />
            </>}

            {loading && payload === null && <p className={styles.hint}>Loading...</p>}
        </div>
    );
};

export { RankingsPanel };
