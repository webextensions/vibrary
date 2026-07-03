import cx from 'classnames';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import type { MultiValue } from 'react-select';
import Select from 'react-select';

import { listFiles, searchFiles, type SearchFileResult } from '../api.ts';
import { SearchIcon } from './Icons.tsx';

import styles from './SearchPanel.module.css';

type Option = { value: string; label: string };

// Wait for the user to pause typing before hitting the backend, so each keystroke does not fire a request.
const DEBOUNCE_MS = 250;
// Matches the backend's floor (searchVibrary's MIN_QUERY_LENGTH - keep the two in sync): a one-character query is
// too broad to be useful, and skipping it here avoids a round trip that would answer with nothing.
const MIN_QUERY_LENGTH = 2;

// Emphasize each case-insensitive occurrence of `query` within a snippet line, leaving the rest as plain text. Splitting
// on a lowercased copy keeps the original casing in the output.
const highlight = function (text: string, query: string): ReactNode {
    const haystack = text.toLowerCase();
    const needle = query.toLowerCase();
    // An empty needle would make indexOf return 0 forever - an infinite loop that hangs the tab. Unreachable through
    // today's callers (results only render for queries at or above the length floor), but that invariant lives far
    // from this loop, so guard it here rather than trust every future caller.
    if (needle === '') {
        return text;
    }
    const parts: ReactNode[] = [];
    let cursor = 0;
    let found = haystack.indexOf(needle, cursor);
    let key = 0;
    while (found !== -1) {
        if (found > cursor) {
            parts.push(text.slice(cursor, found));
        }
        parts.push(<mark key={key} className={styles.mark}>{text.slice(found, found + needle.length)}</mark>);
        key += 1;
        cursor = found + needle.length;
        found = haystack.indexOf(needle, cursor);
    }
    if (cursor < text.length) {
        parts.push(text.slice(cursor));
    }
    return parts;
};

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
    // Bumped by the error message's Retry button to re-run the search effect below without changing the query or file
    // filter - simplest way to give a failed search an explicit retry, matching SourceControlPanel's own Refresh
    // button staying live in its error state.
    const [retryNonce, setRetryNonce] = useState(0);

    // Every file the Explorer would list, for the "narrow to files" multi-select; loaded once. An empty selection
    // searches everywhere, matching how the editor's own status/type filters treat an empty selection.
    const [fileOptions, setFileOptions] = useState<Option[]>([]);
    const [fileFilter, setFileFilter] = useState<Option[]>([]);

    // Focus the query box when the Search view opens (the panel mounts only while its rail view is active), so
    // switching to Search is immediately typeable - the sidebar-search convention. Skipped on mobile, where an
    // autofocus would pop the on-screen keyboard over the freshly opened drawer.
    const inputReference = useRef<HTMLInputElement>(null);
    useEffect(function () {
        if (!window.matchMedia('(max-width: 700px)').matches) {
            inputReference.current?.focus();
        }
    }, []);

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
        let isCancelled = false;
        // Run everything (including the too-short-query reset) inside the debounce timer, so no state is set
        // synchronously during the effect body.
        const timer = setTimeout(async function () {
            if (trimmed.length < MIN_QUERY_LENGTH) {
                if (!isCancelled) {
                    setResults([]);
                    setTruncated(false);
                    setSearching(false);
                    setError(null);
                    setSearchedQuery('');
                }
                return;
            }
            setSearching(true);
            try {
                const output = await searchFiles(trimmed, fileFilter.map(function (option) {
                    return option.value;
                }));
                if (isCancelled) {
                    return;
                }
                setResults(output.results);
                setTruncated(output.truncated);
                setSearchedQuery(trimmed);
                setError(null);
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
    }, [query, fileFilter, retryNonce]);

    const totalMatches = results.reduce(function (sum, file) {
        return sum + file.matches.length;
    }, 0);

    return (
        <div className={styles.searchPanel}>
            <div className={styles.searchField}>
                <SearchIcon />
                <input
                    ref={inputReference}
                    type="search"
                    className={styles.searchInput}
                    placeholder="Search files..."
                    aria-label="Search files"
                    value={query}
                    onChange={function (changeEvent) {
                        setQuery(changeEvent.target.value);
                    }}
                />
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

            <ul className={cx(styles.resultList, searching && styles.resultListStale)}>
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
                                                title={`Open ${match.title || 'this entry'} (match in ${match.field})`}
                                                onClick={function () {
                                                    onOpenMatch(file.path, searchedQuery, match.entryIndex);
                                                }}
                                            >
                                                <span className={styles.matchEntryTitle}>{highlight(match.title || '(untitled)', searchedQuery)}</span>
                                                <span className={styles.matchText}>{highlight(match.snippet, searchedQuery)}</span>
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
