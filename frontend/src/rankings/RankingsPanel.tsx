import { useCallback, useEffect, useState } from 'react';

import { getFilesSummary, getRankings, type RankingsPayload } from '../api.ts';
import { RefreshIcon } from '../shared/Icons.tsx';

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

    const hasMatches = payload !== null && payload.matches.length > 0;

    return (
        <div className={styles.rankingsPanel}>
            <div className={styles.headerRow}>
                <h2 className={styles.heading}>Rankings</h2>
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
            </>}

            {loading && payload === null && <p className={styles.hint}>Loading...</p>}
        </div>
    );
};

export { RankingsPanel };
