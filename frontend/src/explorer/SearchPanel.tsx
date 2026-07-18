import cx from 'classnames';
import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useRef, useState } from 'react';
import type { MultiValue } from 'react-select';
import Select from 'react-select';

import { MIN_QUERY_LENGTH } from '../../../shared/apiLimits.js';
import { parseSearchQuery } from '../../../shared/parseSearchQuery.js';
import { announce } from '../shared/announcer.ts';
import { listFiles, searchFiles, type SearchFileResult } from '../api.ts';
import { highlightText } from '../shared/highlightText.tsx';
import { RemoveIcon, SearchIcon, TypeIcon } from '../shared/Icons.tsx';

import styles from './SearchPanel.module.css';

type Option = { value: string; label: string };

// Wait for the user to pause typing before hitting the backend, so each keystroke does not fire a request.
const DEBOUNCE_MS = 250;

// Entry search across the included vibrary files. Results are grouped by file, one row per matching ENTRY (title +
// snippet); clicking a row opens the file and asks the editor to scroll to / highlight that entry (see App's
// searchTarget wiring). The backend reports each match's index within the file's parsed entries, so the editor
// addresses the entry directly instead of re-deriving which one matched.
const SearchPanel = function ({ onOpenMatch }: { onOpenMatch: (name: string, query: string, matchIndex: number) => void }) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchFileResult[]>([]);
    const [truncated, setTruncated] = useState(false);
    const [searching, setSearching] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // The query the current `results` belong to, so an empty/too-short query clears the "no matches" message correctly.
    const [searchedQuery, setSearchedQuery] = useState('');
    // The free-text needle of that query (operators stripped), for snippet highlighting and the editor jump - marking
    // the literal "type:spec" text inside snippets would be nonsense.
    const [searchedNeedle, setSearchedNeedle] = useState('');
    // Bumped by the error message's Retry button to re-run the search effect below without changing the query or file
    // filter - simplest way to give a failed search an explicit retry, matching SourceControlPanel's own Refresh
    // button staying live in its error state.
    const [retryNonce, setRetryNonce] = useState(0);

    // Every file the Explorer would list, for the "narrow to files" multi-select; loaded once. An empty selection
    // searches everywhere, matching how the editor's own status/type filters treat an empty selection.
    const [fileOptions, setFileOptions] = useState<Option[]>([]);
    const [fileFilter, setFileFilter] = useState<Option[]>([]);

    // Precision toggles, per query rather than persisted: they tighten the backend's matching (Find & replace already
    // honors case; Search should not be the weaker engine). Both off reproduces the default case-insensitive
    // substring scan.
    const [matchCase, setMatchCase] = useState(false);
    const [wholeWord, setWholeWord] = useState(false);

    // Focus the query box when the Search view opens (the panel mounts only while its rail view is active), so
    // switching to Search is immediately typeable - the sidebar-search convention. Skipped on mobile, where an
    // autofocus would pop the on-screen keyboard over the freshly opened drawer.
    const inputReference = useRef<HTMLInputElement>(null);
    useEffect(function () {
        if (!window.matchMedia('(max-width: 700px)').matches) {
            inputReference.current?.focus();
        }
    }, []);

    // Arrow-key roving focus over the results: ArrowDown from the query box drops into the first result, then
    // ArrowUp/ArrowDown walk the result rows (ArrowUp from the first returns to the query box), so a keyboard user
    // can reach any match without tabbing through every one. Enter opens the focused row (it is a plain button). Only
    // acts when the query box or a result row is focused, so it never hijacks the react-select's own arrow handling.
    const resultListReference = useRef<HTMLUListElement>(null);
    const handleResultsKeyDown = function (event: ReactKeyboardEvent<HTMLDivElement>) {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
            return;
        }
        const buttons = resultListReference.current === null ?
            [] :
            [...resultListReference.current.querySelectorAll('button')];
        if (buttons.length === 0) {
            return;
        }
        const active = document.activeElement;
        if (active === inputReference.current) {
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                buttons[0].focus();
            }
            return;
        }
        const index = active instanceof HTMLButtonElement ? buttons.indexOf(active) : -1;
        if (index === -1) {
            return;
        }
        event.preventDefault();
        if (event.key === 'ArrowDown') {
            buttons[Math.min(index + 1, buttons.length - 1)].focus();
        } else if (index === 0) {
            inputReference.current?.focus();
        } else {
            buttons[index - 1].focus();
        }
    };

    useEffect(function () {
        let isCancelled = false;
        void (async function () {
            try {
                const { files } = await listFiles();
                if (!isCancelled) {
                    setFileOptions(files.map(function (name) {
                        return { value: name, label: name };
                    }));
                }
            } catch {
                // The filter is a convenience; leave it empty (unfiltered search still works) rather than surfacing
                // a listing failure here - the explorer's own load already reports that.
            }
        })();
        return function () {
            isCancelled = true;
        };
    }, []);

    useEffect(function () {
        const trimmed = query.trim();
        // Mirror the backend's floor rule exactly (both sides share parseSearchQuery): the length floor applies to
        // the free-text needle only, and only when there are no constraints - "type:spec" alone is a valid query
        // with an empty needle, and the floor must not swallow it.
        const { needle, constraints } = parseSearchQuery(trimmed);
        let isCancelled = false;
        // Run everything (including the too-short-query reset) inside the debounce timer, so no state is set
        // synchronously during the effect body.
        const timer = setTimeout(async function () {
            if (constraints.length === 0 && needle.length < MIN_QUERY_LENGTH) {
                if (!isCancelled) {
                    setResults([]);
                    setTruncated(false);
                    setSearching(false);
                    setError(null);
                    setSearchedQuery('');
                    setSearchedNeedle('');
                }
                return;
            }
            setSearching(true);
            try {
                const output = await searchFiles(trimmed, fileFilter.map(function (option) {
                    return option.value;
                }), { matchCase, wholeWord });
                if (isCancelled) {
                    return;
                }
                setResults(output.results);
                setTruncated(output.truncated);
                setSearchedQuery(trimmed);
                setSearchedNeedle(needle);
                setError(null);
                // The visible summary below is render-only; a screen reader hears nothing when results land, so
                // speak the same tally through the app's live region.
                const total = output.results.reduce(function (sum, file) { return sum + file.matches.length; }, 0);
                announce(total === 0 ?
                    'No matches.' :
                    `${total} ${total === 1 ? 'match' : 'matches'} in ${output.results.length} ${output.results.length === 1 ? 'file' : 'files'}`);
            } catch (caught) {
                if (!isCancelled) {
                    setError((caught as Error).message);
                }
            } finally {
                if (!isCancelled) {
                    setSearching(false);
                }
            }
        }, DEBOUNCE_MS);
        return function () {
            isCancelled = true;
            clearTimeout(timer);
        };
    }, [query, fileFilter, matchCase, wholeWord, retryNonce]);

    const totalMatches = results.reduce(function (sum, file) {
        return sum + file.matches.length;
    }, 0);

    // The current query's parsed operators, rendered back as removable chips - a typed "type:spec" visibly BECOMES a
    // filter, and a mistyped "typo:spec" visibly does not (it stays needle text, the honest behaviour). Removing a
    // chip strips its first matching token from the query text, which re-runs the search via the effect above.
    const liveConstraints = parseSearchQuery(query.trim()).constraints;
    const removeConstraint = function (constraint: { field: string; value: string; negated: boolean }) {
        const token = `${constraint.negated ? '-' : ''}${constraint.field}:${constraint.value}`;
        let isRemoved = false;
        setQuery(query.trim().split(/\s+/u).filter(function (word) {
            if (!isRemoved && word === token) {
                isRemoved = true;
                return false;
            }
            return true;
        }).join(' '));
    };

    return (
        <div className={styles.searchPanel} onKeyDown={handleResultsKeyDown}>
            <div className={styles.searchField}>
                <SearchIcon />
                <input
                    ref={inputReference}
                    type="search"
                    className={styles.searchInput}
                    placeholder="Search files... (try type:spec)"
                    aria-label="Search files"
                    value={query}
                    onChange={function (changeEvent) {
                        setQuery(changeEvent.target.value);
                    }}
                />
            </div>

            {liveConstraints.length > 0 &&
            <div className={styles.constraintRow}>
                {liveConstraints.map(function (constraint, index) {
                    return (
                        // Index in the key: the same operator token can legitimately appear twice.
                        // eslint-disable-next-line @eslint-react/no-array-index-key
                        <span key={`${constraint.field}:${constraint.value}:${index}`} className={styles.constraintChip}>
                            {constraint.negated ? 'not ' : ''}{constraint.field}: {constraint.value}
                            <button
                                type="button"
                                className={styles.constraintRemove}
                                aria-label={`Remove the ${constraint.field} filter`}
                                onClick={function () {
                                    removeConstraint(constraint);
                                }}
                            >
                                <RemoveIcon />
                            </button>
                        </span>
                    );
                })}
            </div>}

            <div className={styles.precisionRow}>
                <label className={styles.precisionToggle}>
                    <input
                        type="checkbox"
                        checked={matchCase}
                        onChange={function (changeEvent) {
                            setMatchCase(changeEvent.target.checked);
                        }}
                    />
                    Match case
                </label>
                <label className={styles.precisionToggle}>
                    <input
                        type="checkbox"
                        checked={wholeWord}
                        onChange={function (changeEvent) {
                            setWholeWord(changeEvent.target.checked);
                        }}
                    />
                    Whole word
                </label>
            </div>

            {fileOptions.length > 0 &&
            <Select<Option, true>
                classNamePrefix="rs"
                isMulti
                placeholder="Narrow to files..."
                aria-label="Narrow search to files"
                options={fileOptions}
                value={fileFilter}
                onChange={function (options: MultiValue<Option>) {
                    setFileFilter([...options]);
                }}
            />}

            {error !== null &&
            <p className={styles.message}>
                {error}
                {' '}
                <button
                    type="button"
                    className={styles.retryButton}
                    onClick={function () {
                        setRetryNonce(function (previous) { return previous + 1; });
                    }}
                >
                    Retry
                </button>
            </p>}

            {searching &&
            <p className={styles.message} role="status">Searching...</p>}

            {error === null && searchedQuery !== '' && results.length === 0 && !searching &&
            <p className={styles.message}>No matches.</p>}

            {results.length > 0 &&
            <p className={styles.summary}>
                {totalMatches} {totalMatches === 1 ? 'match' : 'matches'} in {results.length} {results.length === 1 ? 'file' : 'files'}
                {truncated && ' (showing the first results)'}
            </p>}

            <ul ref={resultListReference} className={cx(styles.resultList, searching && styles.resultListStale)}>
                {results.map(function (file) {
                    return (
                        <li key={file.path} className={styles.fileGroup}>
                            <p className={styles.filePath} title={file.path}>{file.path}</p>
                            <ul className={styles.matchList}>
                                {file.matches.map(function (match) {
                                    return (
                                        <li key={match.entryIndex}>
                                            <button
                                                type="button"
                                                className={styles.matchRow}
                                                title={`Open ${match.title || 'this entry'} (${match.type}, match in ${match.field})`}
                                                onClick={function () {
                                                    // A constraint-only match has no needle for the editor's jump
                                                    // to re-find the entry by, so the entry's own title stands in.
                                                    onOpenMatch(file.path, searchedNeedle !== '' ? searchedNeedle : match.title, match.entryIndex);
                                                }}
                                            >
                                                <span className={styles.matchType} title={match.type}><TypeIcon type={match.type} /></span>
                                                <span className={styles.matchEntryTitle}>{highlightText(match.title || '(untitled)', searchedNeedle, styles.mark)}</span>
                                                {match.field !== 'title' &&
                                                <span className={styles.matchText}>{highlightText(match.snippet, searchedNeedle, styles.mark)}</span>}
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
};

export { SearchPanel };
