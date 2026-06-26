import { type ReactNode, useEffect, useState } from 'react';

import { searchFiles, type SearchFileResult } from '../api.ts';
import { SearchIcon } from './Icons.tsx';

import styles from './SearchPanel.module.css';

// Wait for the user to pause typing before hitting the backend, so each keystroke does not fire a request.
const DEBOUNCE_MS = 250;
// Match the backend's floor; a one-character query is too broad to be useful.
const MIN_QUERY_LENGTH = 2;

// Emphasize each case-insensitive occurrence of `query` within a snippet line, leaving the rest as plain text. Splitting
// on a lowercased copy keeps the original casing in the output.
const highlight = function (text: string, query: string): ReactNode {
    const haystack = text.toLowerCase();
    const needle = query.toLowerCase();
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

// Full-text search across the included runbooks files. Results are grouped by file; clicking a match opens the file and
// asks the editor to scroll to / highlight the first matching entry (see App's searchTarget wiring).
const SearchPanel = function ({ onOpenMatch }: { onOpenMatch: (name: string, query: string) => void }) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchFileResult[]>([]);
    const [truncated, setTruncated] = useState(false);
    const [searching, setSearching] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // The query the current `results` belong to, so an empty/too-short query clears the "no matches" message correctly.
    const [searchedQuery, setSearchedQuery] = useState('');

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
                const output = await searchFiles(trimmed);
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
    }, [query]);

    const totalMatches = results.reduce(function (sum, file) {
        return sum + file.matches.length;
    }, 0);

    return (
        <div className={styles.searchPanel}>
            <div className={styles.searchField}>
                <SearchIcon />
                <input
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

            {error !== null && <p className={styles.message}>{error}</p>}

            {error === null && searchedQuery !== '' && results.length === 0 && !searching &&
            <p className={styles.message}>No matches.</p>}

            {results.length > 0 &&
            <p className={styles.summary}>
                {totalMatches} {totalMatches === 1 ? 'match' : 'matches'} in {results.length} {results.length === 1 ? 'file' : 'files'}
                {truncated && ' (showing the first results)'}
            </p>}

            <ul className={styles.resultList}>
                {results.map(function (file) {
                    return (
                        <li key={file.path} className={styles.fileGroup}>
                            <p className={styles.filePath} title={file.path}>{file.path}</p>
                            <ul className={styles.matchList}>
                                {file.matches.map(function (match) {
                                    return (
                                        <li key={match.line}>
                                            <button
                                                type="button"
                                                className={styles.matchRow}
                                                onClick={function () {
                                                    onOpenMatch(file.path, searchedQuery);
                                                }}
                                            >
                                                <span className={styles.lineNumber}>{match.line}</span>
                                                <span className={styles.matchText}>{highlight(match.text, searchedQuery)}</span>
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
