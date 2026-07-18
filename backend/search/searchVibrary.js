import { readFile } from 'node:fs/promises';

import ignore from 'ignore';

import { MIN_QUERY_LENGTH } from '../../shared/apiLimits.js';
import { parseSearchQuery } from '../../shared/parseSearchQuery.js';
import { approvalState, parseVibraryXml } from '../../shared/vibraryXmlCore.js';
import { listVibraryFiles } from '../files/vibraryFiles.js';
import { resolveWithinCwd } from '../shared/resolveWithinCwd.js';

// Bound the response so a broad query against a large folder cannot return an unbounded payload; the UI notes when a
// result set was truncated.
const MAX_TOTAL_MATCHES = 500;
const MAX_MATCHES_PER_FILE = 50;
// Keep snippets short so the results list stays scannable.
const MAX_SNIPPET_LENGTH = 200;

// The entry fields a match can live in, in the order the snippet prefers them.
const SEARCH_FIELDS = ['title', 'content', 'notes'];

// How much of the matched line to keep before the needle when the line is too long to show whole, so the match sits
// just inside the window rather than at its very edge.
const SNIPPET_CONTEXT_BEFORE = 30;

// Word characters for the whole-word rule: letters, digits and underscore - the class editors use. A hyphen is NOT a
// word character, so whole-word "auth" still matches the hyphenated titles the normalizeTitle rule produces
// ("auth-token").
const WORD_CHARACTER = /[A-Za-z0-9_]/;

// The index of the first occurrence of `needle` in `text` honoring the precision flags, or -1. The needle arrives
// already lowercased when matchCase is off (searchVibrary normalizes it once, not per field); only the haystack is
// folded here. Whole-word requires a non-word character (or the string edge) on both sides of the occurrence, and
// keeps scanning past occurrences that fail it - "api" must find the standalone word even when "capillary" comes
// first in the text.
const findMatchIndex = function (text, needle, { matchCase, wholeWord }) {
    const haystack = matchCase ? text : text.toLowerCase();
    let at = haystack.indexOf(needle);
    while (at !== -1) {
        const isBoundedBefore = at === 0 || !WORD_CHARACTER.test(haystack[at - 1]);
        const isBoundedAfter = at + needle.length >= haystack.length || !WORD_CHARACTER.test(haystack[at + needle.length]);
        if (!wholeWord || (isBoundedBefore && isBoundedAfter)) {
            return at;
        }
        at = haystack.indexOf(needle, at + 1);
    }
    return -1;
};

// The trimmed, length-capped snippet around the needle's first occurrence in `text`, or null when it does not occur.
// A line that fits within the cap is returned whole; a longer one is windowed AROUND the match (with "..." marking a
// clipped end) rather than sliced from the line start - otherwise a match far into a long line would be cut off and the
// snippet would not even contain the term the user searched for.
const buildSnippet = function (text, needle, precision) {
    const at = findMatchIndex(text, needle, precision);
    if (at === -1) {
        return null;
    }
    const lineStart = text.lastIndexOf('\n', at) + 1;
    const lineEndRaw = text.indexOf('\n', at);
    const lineEnd = lineEndRaw === -1 ? text.length : lineEndRaw;
    const rawLine = text.slice(lineStart, lineEnd);
    const line = rawLine.trim();
    // Decide on the TRIMMED length: a deeply-indented line whose visible text fits should be returned whole, not
    // windowed (which would emit a spurious leading "..." over dropped blank space).
    if (line.length <= MAX_SNIPPET_LENGTH) {
        return line;
    }
    // Window the long line so the match is visible: start a little before it, take one snippet's worth, and pull the
    // start back if that ran past the line end so the window stays full. The offset is relative to the left-trimmed
    // line, so leading whitespace does not shift the window off the match.
    const matchInLine = at - lineStart - (rawLine.length - rawLine.trimStart().length);
    const end = Math.min(line.length, Math.max(0, matchInLine - SNIPPET_CONTEXT_BEFORE) + MAX_SNIPPET_LENGTH);
    const start = Math.max(0, end - MAX_SNIPPET_LENGTH);
    return `${start > 0 ? '...' : ''}${line.slice(start, end).trim()}${end < line.length ? '...' : ''}`;
};

// The first field of `entry` containing the needle, with its snippet - or null for a non-matching entry. The three
// text fields are checked first (in snippet-preference order); labels are checked last, so a term that also appears in
// the title/content/notes still surfaces the richer text snippet, and a labels-only match is caught rather than missed.
const matchEntry = function (entry, needle, precision) {
    for (const field of SEARCH_FIELDS) {
        const snippet = buildSnippet(entry[field], needle, precision);
        if (snippet !== null) {
            return { field, snippet };
        }
    }
    // Labels are an array, not a line of text, so they cannot go through buildSnippet; match any label containing the
    // needle and surface the matching labels (comma-joined, capped) as the snippet.
    const matchingLabels = entry.labels.filter(function (label) {
        return findMatchIndex(label, needle, precision) !== -1;
    });
    if (matchingLabels.length > 0) {
        return { field: 'labels', snippet: matchingLabels.join(', ').slice(0, MAX_SNIPPET_LENGTH) };
    }
    return null;
};

// The approved:/by: operator vocabularies, mapped onto the values the app already speaks: approvalState's three-way
// answer (not a fourth definition of "approved" - the same helper behind the card's green/yellow button), and the
// createdBy agent field ('' meaning unspecified).
const APPROVED_VALUES = { yes: 'current', no: 'none', stale: 'stale' };
const BY_VALUES = { ai: 'ai', human: 'human', unspecified: '' };

// Whether one entry satisfies every non-file constraint (file: is applied to the listing, before parsing). Values
// compare case-insensitively; an unknown vocabulary value (approved:maybe) matches nothing, so the AND stays honest.
const entryMatchesConstraints = function (entry, constraints) {
    return constraints.every(function ({ field, value, negated }) {
        if (field === 'file') {
            return true;
        }
        const folded = value.toLowerCase();
        let isSatisfied = false;
        if (field === 'type') {
            isSatisfied = entry.type.toLowerCase() === folded;
        } else if (field === 'label') {
            isSatisfied = entry.labels.some(function (label) { return label.toLowerCase() === folded; });
        } else if (field === 'approved') {
            isSatisfied = Object.hasOwn(APPROVED_VALUES, folded) && approvalState(entry) === APPROVED_VALUES[folded];
        } else if (field === 'by') {
            isSatisfied = Object.hasOwn(BY_VALUES, folded) && entry.createdBy.toLowerCase() === BY_VALUES[folded];
        }
        return negated ? !isSatisfied : isSatisfied;
    });
};

// Narrow the listing by the file: constraints, each a gitignore-style glob matched by the same `ignore` library that
// backs .vibraryinclude - so file:specs*.xml behaves exactly like the include pattern a user already knows.
const applyFileConstraints = function (names, constraints) {
    let narrowed = names;
    for (const { field, value, negated } of constraints) {
        if (field !== 'file') {
            continue;
        }
        const matcher = ignore().add(value);
        narrowed = narrowed.filter(function (name) {
            return matcher.ignores(name) !== negated;
        });
    }
    return narrowed;
};

// The snippet for a constraint-only match (no needle to window around): the head of the entry's content, unmarked.
const constraintOnlyMatch = function (entry) {
    const firstLine = entry.content.trim().split('\n', 1)[0];
    return { field: 'content', snippet: firstLine.slice(0, MAX_SNIPPET_LENGTH) };
};

// Collect up to `limit` entry matches within one file's parsed entries. Kept as its own function so the scan's
// early break is not a break inside a nested loop. An empty needle (a constraint-only query like "type:spec") makes
// every constraint-satisfying entry a match, with the head-of-content snippet.
const collectMatchesInFile = function (entries, needle, limit, precision, constraints) {
    const matches = [];
    for (const [entryIndex, entry] of entries.entries()) {
        if (!entryMatchesConstraints(entry, constraints)) {
            continue;
        }
        const match = needle === '' ? constraintOnlyMatch(entry) : matchEntry(entry, needle, precision);
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

// ENTRY search across exactly the files the Explorer lists (the .vibraryinclude-scoped vibrary files), so Search and
// Explorer always agree on scope. A match is an entry whose title/content/notes/labels contain
// the query - one match per entry, however many times the query occurs - and carries the entry's index within its file,
// so a clicked result addresses the editor's parsed entries directly (both sides parse the same file). Searching the
// parsed fields rather than the raw XML also keeps markup out of the results: a query like "task" no longer floods
// the panel with <entry type="task"> lines. A file that cannot be read OR parsed is skipped (its entries are not
// addressable); `truncated` flags that a cap was hit so the UI can say results are incomplete. `options.files`, when
// non-empty, narrows the scope to just those file names (an empty/absent list imposes no constraint - "search
// everywhere" - matching how the editor's own status/type filters treat an empty selection). `options.matchCase` and
// `options.wholeWord` tighten the matching (both default off, keeping the case-insensitive substring behavior) -
// identifiers are exactly what people search a spec library for, and "api" finding "capillary" is real noise.
const searchVibrary = async function (cwd, query, options = {}) {
    const precision = { matchCase: options.matchCase === true, wholeWord: options.wholeWord === true };
    // The query splits into field constraints (type:/label:/approved:/by:/file:, "-" negating) and the free-text
    // needle; the needle is lowercased ONCE here (not per field) unless the caller asked for case to matter. The
    // length floor applies to the needle only, and only when there are no constraints: "type:spec" alone is a
    // perfectly good query with an empty needle ("list every spec"), and the floor must not swallow it - the
    // MAX_TOTAL_MATCHES / MAX_MATCHES_PER_FILE caps bound the cost of such a match-everything scan instead.
    const { needle: rawNeedle, constraints } = parseSearchQuery(typeof query === 'string' ? query : '');
    const needle = precision.matchCase ? rawNeedle : rawNeedle.toLowerCase();
    if (constraints.length === 0 && needle.length < MIN_QUERY_LENGTH) {
        return { results: [], truncated: false };
    }
    const allNames = applyFileConstraints(await listVibraryFiles(cwd), constraints);
    // file: constraints and the panel's file multi-select AND together, so the two can never contradict each other.
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
        // The names are glob-derived today, but the shared defense-in-depth guard is applied before ANY filesystem
        // access - the same treatment /files-summary gives this very listing (see resolveWithinCwd.js).
        const target = resolveWithinCwd(cwd, name);
        if (target === null) {
            continue;
        }
        let entries;
        try {
            entries = parseVibraryXml(await readFile(target, 'utf8'));
        } catch {
            continue;
        }
        // Never collect more than this file's per-file cap, nor more than the overall budget still has room for.
        const limit = Math.min(MAX_MATCHES_PER_FILE, MAX_TOTAL_MATCHES - total);
        const { matches, hitLimit } = collectMatchesInFile(entries, needle, limit, precision, constraints);
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
