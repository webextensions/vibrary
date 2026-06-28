import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { listVibraryFiles } from './vibraryFiles.js';

// Bound the response so a broad query against a large folder cannot return an unbounded payload; the UI notes when a
// result set was truncated.
const MAX_TOTAL_MATCHES = 500;
const MAX_MATCHES_PER_FILE = 50;
// Keep snippet lines short so the results list stays scannable.
const MAX_SNIPPET_LENGTH = 200;

// Collect up to `limit` line matches for `needle` within one file's content. Kept as its own function so the line scan's
// early break is not a break inside a nested loop.
const collectMatchesInFile = function (content, needle, limit) {
    const matches = [];
    for (const [lineIndex, line] of content.split('\n').entries()) {
        if (!line.toLowerCase().includes(needle)) {
            continue;
        }
        matches.push({ line: lineIndex + 1, text: line.trim().slice(0, MAX_SNIPPET_LENGTH) });
        if (matches.length >= limit) {
            break;
        }
    }
    return matches;
};

// Case-insensitive substring search across exactly the files the Explorer lists (the .vibraryinclude-scoped vibrary
// files), so Search and Explorer always agree on scope. Returns per-file line matches; a file with no match is skipped
// without reading its body twice. `truncated` flags that a cap was hit so the UI can say results are incomplete.
const searchVibrary = async function (cwd, query) {
    if (typeof query !== 'string' || query.trim() === '') {
        return { results: [], truncated: false };
    }
    const needle = query.toLowerCase();
    const names = await listVibraryFiles(cwd);
    const results = [];
    let total = 0;
    let isTruncated = false;

    for (const name of names) {
        if (total >= MAX_TOTAL_MATCHES) {
            isTruncated = true;
            break;
        }
        let content;
        try {
            content = await readFile(path.join(cwd, name), 'utf8');
        } catch {
            continue;
        }
        if (!content.toLowerCase().includes(needle)) {
            continue;
        }
        // Never collect more than this file's per-file cap, nor more than the overall budget still has room for.
        const limit = Math.min(MAX_MATCHES_PER_FILE, MAX_TOTAL_MATCHES - total);
        const matches = collectMatchesInFile(content, needle, limit);
        if (matches.length === 0) {
            continue;
        }
        total += matches.length;
        if (matches.length >= limit) {
            isTruncated = true;
        }
        results.push({ path: name, matches });
    }

    return { results, truncated: isTruncated };
};

export { searchVibrary };
