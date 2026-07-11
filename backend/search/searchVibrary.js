import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { parseVibraryXml } from '../../shared/vibraryXmlCore.js';
import { listVibraryFiles } from '../files/vibraryFiles.js';

// Bound the response so a broad query against a large folder cannot return an unbounded payload; the UI notes when a
// result set was truncated.
const MAX_TOTAL_MATCHES = 500;
const MAX_MATCHES_PER_FILE = 50;
// Keep snippets short so the results list stays scannable.
const MAX_SNIPPET_LENGTH = 200;
// A one-character query is too broad to be useful and scans every included file for nothing; the frontend's
// SearchPanel enforces the same floor before sending, so the UI never hits this branch.
const MIN_QUERY_LENGTH = 2;

// The entry fields a match can live in, in the order the snippet prefers them.
const SEARCH_FIELDS = ['title', 'content', 'notes'];

// How much of the matched line to keep before the needle when the line is too long to show whole, so the match sits
// just inside the window rather than at its very edge.
const SNIPPET_CONTEXT_BEFORE = 30;

// The trimmed, length-capped snippet around the needle's first occurrence in `text`, or null when it does not occur.
// A line that fits within the cap is returned whole; a longer one is windowed AROUND the match (with "..." marking a
// clipped end) rather than sliced from the line start - otherwise a match far into a long line would be cut off and the
// snippet would not even contain the term the user searched for.
const buildSnippet = function (text, needle) {
    const at = text.toLowerCase().indexOf(needle);
    if (at === -1) {
        return null;
    }
    const lineStart = text.lastIndexOf('\n', at) + 1;
    const lineEndRaw = text.indexOf('\n', at);
    const lineEnd = lineEndRaw === -1 ? text.length : lineEndRaw;
    const line = text.slice(lineStart, lineEnd);
    if (line.length <= MAX_SNIPPET_LENGTH) {
        return line.trim();
    }
    // Window the long line so the match is visible: start a little before it, take one snippet's worth, and pull the
    // start back if that ran past the line end so the window stays full.
    const matchInLine = at - lineStart;
    const end = Math.min(line.length, Math.max(0, matchInLine - SNIPPET_CONTEXT_BEFORE) + MAX_SNIPPET_LENGTH);
    const start = Math.max(0, end - MAX_SNIPPET_LENGTH);
    return `${start > 0 ? '...' : ''}${line.slice(start, end).trim()}${end < line.length ? '...' : ''}`;
};

// The first field of `entry` containing the needle, with its snippet - or null for a non-matching entry. The three
// text fields are checked first (in snippet-preference order); labels are checked last, so a term that also appears in
// the title/content/notes still surfaces the richer text snippet, and a labels-only match is caught rather than missed.
const matchEntry = function (entry, needle) {
    for (const field of SEARCH_FIELDS) {
        const snippet = buildSnippet(entry[field], needle);
        if (snippet !== null) {
            return { field, snippet };
        }
    }
    // Labels are an array, not a line of text, so they cannot go through buildSnippet; match any label containing the
    // needle and surface the matching labels (comma-joined, capped) as the snippet.
    const matchingLabels = entry.labels.filter(function (label) {
        return label.toLowerCase().includes(needle);
    });
    if (matchingLabels.length > 0) {
        return { field: 'labels', snippet: matchingLabels.join(', ').slice(0, MAX_SNIPPET_LENGTH) };
    }
    return null;
};

// Collect up to `limit` entry matches within one file's parsed entries. Kept as its own function so the scan's
// early break is not a break inside a nested loop.
const collectMatchesInFile = function (entries, needle, limit) {
    const matches = [];
    for (const [entryIndex, entry] of entries.entries()) {
        const match = matchEntry(entry, needle);
        if (match === null) {
            continue;
        }
        if (matches.length >= limit) {
            return { matches, hitLimit: true };
        }
        matches.push({ entryIndex, type: entry.type, title: entry.title, field: match.field, snippet: match.snippet });
    }
    return { matches, hitLimit: false };
};

// Case-insensitive ENTRY search across exactly the files the Explorer lists (the .vibraryinclude-scoped vibrary
// files), so Search and Explorer always agree on scope. A match is an entry whose title/content/notes/labels contain
// the query - one match per entry, however many times the query occurs - and carries the entry's index within its file,
// so a clicked result addresses the editor's parsed entries directly (both sides parse the same file). Searching the
// parsed fields rather than the raw XML also keeps markup out of the results: a query like "task" no longer floods
// the panel with <entry type="task"> lines. A file that cannot be read OR parsed is skipped (its entries are not
// addressable); `truncated` flags that a cap was hit so the UI can say results are incomplete. `options.files`, when
// non-empty, narrows the scope to just those file names (an empty/absent list imposes no constraint - "search
// everywhere" - matching how the editor's own status/type filters treat an empty selection).
const searchVibrary = async function (cwd, query, options = {}) {
    // The needle is the trimmed query: surrounding whitespace is meaningless here (the emptiness/floor checks already
    // treat it that way), so a padded direct API call searches for the same thing the UI would send.
    const needle = typeof query === 'string' ? query.trim().toLowerCase() : '';
    if (needle.length < MIN_QUERY_LENGTH) {
        return { results: [], truncated: false };
    }
    const allNames = await listVibraryFiles(cwd);
    const fileScope = Array.isArray(options.files) && options.files.length > 0 ? new Set(options.files) : null;
    const names = fileScope === null ?
        allNames :
        allNames.filter(function (name) {
            return fileScope.has(name);
        });
    const results = [];
    let total = 0;
    let isTruncated = false;

    for (const name of names) {
        if (total >= MAX_TOTAL_MATCHES) {
            isTruncated = true;
            break;
        }
        let entries;
        try {
            entries = parseVibraryXml(await readFile(path.join(cwd, name), 'utf8'));
        } catch {
            continue;
        }
        // Never collect more than this file's per-file cap, nor more than the overall budget still has room for.
        const limit = Math.min(MAX_MATCHES_PER_FILE, MAX_TOTAL_MATCHES - total);
        const { matches, hitLimit } = collectMatchesInFile(entries, needle, limit);
        if (hitLimit) {
            isTruncated = true;
        }
        if (matches.length === 0) {
            continue;
        }
        total += matches.length;
        results.push({ path: name, matches });
    }

    return { results, truncated: isTruncated };
};

export { searchVibrary };
