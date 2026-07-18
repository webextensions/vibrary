import { useCallback, useEffect, useState } from 'react';
import type { MultiValue } from 'react-select';
import Select from 'react-select';

import { useActivityQueueActions } from '../activity/activityQueue.ts';
import { discardMatches, getFilesSummary, getRankings, type RankingsPayload, type RankingsScope, recordManualMatch, runCompetitions } from '../api.ts';
import { announce } from '../shared/announcer.ts';
import { AccordionSection } from '../shared/AccordionSection.tsx';
import { AiIcon, RefreshIcon } from '../shared/Icons.tsx';
import { readStored, writeStored } from '../shared/storage.ts';
import { ENTRY_TYPES, type EntryType } from '../xml/vibraryXml.ts';
import { CompareMode } from './CompareMode.tsx';
import { MatchHistory } from './MatchHistory.tsx';
import { RunCompetitionsDialog } from './RunCompetitionsDialog.tsx';

import styles from './RankingsPanel.module.css';

// Where each title lives (file + index within the file's parsed entries), so a standings row can jump to its entry
// exactly like a search result does. First occurrence wins, matching the folder-wide title-resolution rule.
type EntryLocation = { name: string; entryIndex: number };

// The scope choice is remembered across reloads like the editor's sort. Stored as JSON; a stale or hand-edited value
// narrows back to known entry types, and an emptied type list falls back to the idea default rather than persisting
// a scope that selects nothing.
const SCOPE_KEY = 'vibrary:rankings-scope';

const DEFAULT_SCOPE: RankingsScope = { types: ['idea'], labels: [] };

const readStoredScope = function (): RankingsScope {
    return readStored<RankingsScope>(SCOPE_KEY, function (raw) {
        const parsed = JSON.parse(raw) as { types?: unknown; labels?: unknown };
        const types = (Array.isArray(parsed.types) ? parsed.types : []).filter(function (type): type is EntryType {
            return typeof type === 'string' && (ENTRY_TYPES as readonly string[]).includes(type);
        });
        const labels = (Array.isArray(parsed.labels) ? parsed.labels : []).filter(function (label): label is string {
            return typeof label === 'string' && label !== '';
        });
        return { types: types.length > 0 ? types : [...DEFAULT_SCOPE.types], labels };
    }, DEFAULT_SCOPE);
};

// The standings plus the title locations and the folder's label vocabulary, fetched together: the locations and
// labels come from the same summary the sidebar badges use, so the panel always agrees with the explorer.
const fetchRankingsView = async function (scope: RankingsScope): Promise<{ rankings: RankingsPayload; located: Map<string, EntryLocation>; folderLabels: string[] }> {
    const [rankings, summary] = await Promise.all([getRankings(scope), getFilesSummary()]);
    const located = new Map<string, EntryLocation>();
    const labels = new Set<string>();
    for (const file of summary.files) {
        for (const [entryIndex, title] of file.titles.entries()) {
            if (!located.has(title)) {
                located.set(title, { name: file.name, entryIndex });
            }
        }
        for (const label of file.labels) {
            labels.add(label);
        }
    }
    const folderLabels = [...labels].toSorted(function (a, b) {
        return a.localeCompare(b);
    });
    return { rankings, located, folderLabels };
};

const TYPE_LABELS: Record<EntryType, string> = { spec: 'Specs', review: 'Reviews', task: 'Tasks', idea: 'Ideas' };

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
    const [runDialogOpen, setRunDialogOpen] = useState(false);
    // Which entries compete (types + optional labels), remembered across reloads; every request carries it, and
    // changing it refetches. Kept matches outside the scope stay stored - they simply do not replay into the scoped
    // standings.
    const [scope, setScope] = useState<RankingsScope>(readStoredScope);
    const [scopeOpen, setScopeOpen] = useState(false);
    const [folderLabels, setFolderLabels] = useState<string[]>([]);
    const { enqueue } = useActivityQueueActions();

    const load = useCallback(async function () {
        try {
            const { rankings, located, folderLabels: labels } = await fetchRankingsView(scope);
            setPayload(rankings);
            setLocations(located);
            setFolderLabels(labels);
            setError(null);
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'Failed to load rankings');
        } finally {
            setLoading(false);
        }
    }, [scope]);

    // Load when the view is shown and again whenever the scope changes. Done inline (not via `load`) so no state is
    // set synchronously in the effect body, mirroring SourceControlPanel's mount load; `loading` already starts true.
    useEffect(function () {
        let isActive = true;
        const loadForScope = async function () {
            try {
                const { rankings, located, folderLabels: labels } = await fetchRankingsView(scope);
                if (isActive) {
                    setPayload(rankings);
                    setLocations(located);
                    setFolderLabels(labels);
                    setError(null);
                    setSuggestionIndex(0);
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
        void loadForScope();
        return function () {
            isActive = false;
        };
    }, [scope]);

    const updateScope = function (next: RankingsScope) {
        setScope(next);
        writeStored(SCOPE_KEY, JSON.stringify(next));
    };

    // A vote records the pairing exactly as presented (first vs second) with the chosen winner, then adopts the
    // server's recomputed payload so the standings and the next suggestions update in the same render.
    const handleVote = useCallback(async function (pairing: [string, string], winnerTitle: string) {
        setVoting(true);
        try {
            const result = await recordManualMatch({ firstTitle: pairing[0], secondTitle: pairing[1], winnerTitle }, scope);
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
    }, [scope]);

    // Discard is already confirmed by MatchHistory; this adopts the server's recomputed payload, exactly like a vote.
    const handleDiscard = useCallback(async function (ids: string[]) {
        setVoting(true);
        try {
            const result = await discardMatches(ids, scope);
            setPayload(result);
            setSuggestionIndex(0);
            setError(null);
            announce(`Discarded ${result.removed} result${result.removed === 1 ? '' : 's'}`);
        } catch (discardError) {
            setError(discardError instanceof Error ? discardError.message : 'Failed to discard results');
        } finally {
            setVoting(false);
        }
    }, [scope]);

    // Queue an AI competitions run through the activity system - one job holding the single agent slot for the whole
    // batch, abortable and inspectable like every other agent action. The dialog closes as soon as the job is
    // enqueued; when the job settles (either way) the panel reloads so the new AI verdicts appear.
    const handleRunCompetitions = function (count: number, instructions: string) {
        const promptParts = [`Run ${count} AI-judged competition${count === 1 ? '' : 's'} over the ranked entries.`];
        if (instructions !== '') {
            promptParts.push('', 'Judging guidance:', instructions);
        }
        const promise = enqueue({
            kind: 'competitions',
            label: `${count} AI matchup${count === 1 ? '' : 's'}`,
            prompt: promptParts.join('\n'),
            run: function (signal, onEvent) {
                return runCompetitions({ count, instructions, scope }, { signal, onEvent });
            }
        });
        setRunDialogOpen(false);
        void promise.catch(function () {
            // The failure is already recorded on the job's row in the Activity monitor.
        }).finally(function () {
            void load();
        });
    };

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
                    {payload !== null && payload.standings.length >= 2 &&
                    <button
                        type="button"
                        className={styles.iconButton}
                        aria-label="Run AI competitions"
                        title="Run AI competitions"
                        onClick={function () {
                            setRunDialogOpen(true);
                        }}
                    >
                        <AiIcon />
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

            <AccordionSection
                title="Scope"
                expanded={scopeOpen}
                onToggle={function () {
                    setScopeOpen(function (previous) { return !previous; });
                }}
                badge={
                    <span className={styles.scopeBadge}>
                        {scope.types.map(function (type) { return TYPE_LABELS[type]; }).join(', ')}
                        {scope.labels.length > 0 && ` - ${scope.labels.length} label${scope.labels.length === 1 ? '' : 's'}`}
                    </span>
                }
            >
                <div className={styles.scopeTypes}>
                    {ENTRY_TYPES.map(function (type) {
                        return (
                            <label key={type} className={styles.scopeTypeRow}>
                                <input
                                    type="checkbox"
                                    checked={scope.types.includes(type)}
                                    // The last checked type cannot be unchecked: a scope that selects nothing ranks
                                    // nothing, so the checkbox simply refuses rather than silently resetting.
                                    disabled={scope.types.includes(type) && scope.types.length === 1}
                                    onChange={function () {
                                        const has = scope.types.includes(type);
                                        updateScope({
                                            ...scope,
                                            types: has ?
                                                scope.types.filter(function (existing) { return existing !== type; }) :
                                                [...scope.types, type]
                                        });
                                    }}
                                />
                                {TYPE_LABELS[type]}
                            </label>
                        );
                    })}
                </div>
                <Select
                    isMulti
                    placeholder="Any label"
                    aria-label="Narrow to labels"
                    options={folderLabels.map(function (label) { return { value: label, label }; })}
                    value={scope.labels.map(function (label) { return { value: label, label }; })}
                    onChange={function (selection: MultiValue<{ value: string; label: string }>) {
                        updateScope({ ...scope, labels: selection.map(function (option) { return option.value; }) });
                    }}
                />
                <p className={styles.hint}>
                    Entries of the checked types compete{scope.labels.length > 0 ? ', and must carry one of the chosen labels' : ''}.
                    Results recorded outside the scope stay stored but sit out of these standings.
                </p>
            </AccordionSection>

            {runDialogOpen && <RunCompetitionsDialog onClose={function () { setRunDialogOpen(false); }} onRun={handleRunCompetitions} />}

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
                No entries in the current scope to rank. Widen the Scope section or add entries, then record
                head-to-head comparisons here to build an Elo-ranked backlog.
            </p>}

            {error === null && payload !== null && payload.standings.length > 0 &&
            <>
                {!hasMatches &&
                <p className={styles.hint}>
                    Every entry starts at 1500. Record comparisons to separate the field.
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
