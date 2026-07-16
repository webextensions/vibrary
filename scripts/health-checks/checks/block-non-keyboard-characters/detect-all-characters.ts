#!/usr/bin/env node

// Whole-repo character census. Walks every file that belongs in the repo (tracked + untracked but not
// git-ignored) and tallies how many times each distinct Unicode code point appears across all of them.
// The list is printed sorted by code point so a developer can eyeball it and spot suspicious characters
// that the sibling guard (block-characters.ts) does NOT yet catch and may want to add to its
// DETECTORS table.
//
// This is a read-only report: it never edits files and never writes a baseline. Each row shows the code
// point, its total count, a printable label for the glyph, the Unicode General Category, and a status:
//     ascii     - code point <= U+007F (a keyboard character; never needs blocking)
//     detected  - already handled by the guard's DETECTORS table (or one of its allowed replacements)
//     candidate - non-ASCII and NOT yet handled (the rows worth reviewing)
//
// By default the census SKIPS characters.ts (the shared table that intentionally holds the literal glyph
// for every detector). Counting it would surface every blocked character even when nothing else in the
// repo uses it, so skipping it lets the report show which characters genuinely leaked into other files.
// Pass --include-exempt to count characters.ts too (reproducing the unfiltered census).
//
// Usage (from the project's root folder):
//     $ ./scripts/health-checks/checks/block-non-keyboard-characters/detect-all-characters.ts                  # skips characters.ts
//     $ ./scripts/health-checks/checks/block-non-keyboard-characters/detect-all-characters.ts --include-exempt # counts characters.ts too
//     $ node --run block-non-keyboard-characters:detect-all

import path from 'node:path';

import { logger } from '../../../../utils/logger.ts';
import {
    getTrackedFiles,
    readFileAsTextOrNull
} from '../../../utils/repo-files.ts';
import {
    ALLOWED_CHARACTERS,
    DETECTORS
} from './characters.ts';
import { EXEMPTED_FILES } from './exempted-files.ts';

const projectRoot = path.resolve(import.meta.dirname, '..', '..', '..', '..');

// Files the census skips by default (re-includable with --include-exempt): only the entries flagged
// `appliesToCensus` in the shared exempted-files list, matched via each entry's `matches(relPath)`
// predicate. That covers characters.ts (it holds the literal glyph for every detector, so counting it
// would surface every blocked character even when nothing else uses it); CHANGELOG.md is exempt from
// the guard but deliberately still counted here.
const isExemptFromCensus = function (file: string): boolean {
    return EXEMPTED_FILES.some((entry) => entry.appliesToCensus && entry.matches(file));
};

// The code points the guard already knows about: the DETECTORS glyphs plus the allowed heavy ticks
// (ALLOWED_CHARACTERS) we replace TO. Derived from the shared tables in characters.ts so it cannot drift.
const KNOWN_CODE_POINTS = new Set<number>(
    [...DETECTORS, ...ALLOWED_CHARACTERS]
        .map((character) => character.char.codePointAt(0))
        .filter((cp) => cp !== undefined)
);

// Unicode General Categories, by long name. Each code point belongs to exactly one, so the first match
// wins; anything that matches none (e.g. unassigned code points) falls back to 'Unassigned'.
const CATEGORY_NAMES: readonly string[] = [
    'Uppercase_Letter', 'Lowercase_Letter', 'Titlecase_Letter', 'Modifier_Letter', 'Other_Letter',
    'Nonspacing_Mark', 'Spacing_Mark', 'Enclosing_Mark',
    'Decimal_Number', 'Letter_Number', 'Other_Number',
    'Connector_Punctuation', 'Dash_Punctuation', 'Open_Punctuation', 'Close_Punctuation',
    'Initial_Punctuation', 'Final_Punctuation', 'Other_Punctuation',
    'Math_Symbol', 'Currency_Symbol', 'Modifier_Symbol', 'Other_Symbol',
    'Space_Separator', 'Line_Separator', 'Paragraph_Separator',
    'Control', 'Format', 'Surrogate', 'Private_Use'
];

const CATEGORY_MATCHERS = CATEGORY_NAMES.map(function (name) {
    return { name, regex: new RegExp(String.raw`\p{` + name + '}', 'u') };
});

// Categories whose glyphs are invisible or would break the table layout (controls, zero-width combining
// marks, separators, etc.). For these we print a "<U+XXXX>" placeholder instead of the raw character.
const BRACKETED_CATEGORIES = new Set<string>([
    'Nonspacing_Mark', 'Enclosing_Mark',
    'Line_Separator', 'Paragraph_Separator',
    'Control', 'Format', 'Surrogate', 'Private_Use', 'Unassigned'
]);

interface Row {
    category: string;
    count: string;
    cp: string;
    glyph: string;
    status: string
}

const hex = function (cp: number): string {
    return cp.toString(16).toUpperCase().padStart(4, '0');
};

const categoryOf = function (cp: number): string {
    const char = String.fromCodePoint(cp);
    for (const matcher of CATEGORY_MATCHERS) {
        if (matcher.regex.test(char)) {
            return matcher.name;
        }
    }
    return 'Unassigned';
};

const glyphLabel = function (cp: number, category: string): string {
    if (cp === 0x09) {
        return String.raw`\t`;
    }
    if (cp === 0x0A) {
        return String.raw`\n`;
    }
    if (cp === 0x0D) {
        return String.raw`\r`;
    }
    if (category === 'Space_Separator') {
        return 'SP';
    }
    if (BRACKETED_CATEGORIES.has(category)) {
        return '<U+' + hex(cp) + '>';
    }
    return String.fromCodePoint(cp);
};

const statusOf = function (cp: number): string {
    if (cp <= 0x7F) {
        return 'ascii';
    }
    if (KNOWN_CODE_POINTS.has(cp)) {
        return 'detected';
    }
    return 'candidate';
};

const pad = function (value: string, width: number, align: 'left' | 'right'): string {
    return align === 'right' ? value.padStart(width) : value.padEnd(width);
};

const main = function (includeExempt: boolean): void {
    const files = getTrackedFiles(projectRoot);
    const counts = new Map<number, number>();
    let scannedCount = 0;
    let totalChars = 0;

    for (const file of files) {
        if (!includeExempt && isExemptFromCensus(file)) {
            continue; // skip the census-exempt entries by default (see isExemptFromCensus)
        }
        const content = readFileAsTextOrNull(path.join(projectRoot, file));
        if (content === null) {
            continue;
        }
        scannedCount += 1;
        for (const char of content) {
            const cp = char.codePointAt(0);
            if (cp === undefined) {
                continue;
            }
            counts.set(cp, (counts.get(cp) ?? 0) + 1);
            totalChars += 1;
        }
    }

    const codePoints = counts.keys().toArray().toSorted((a, b) => a - b);
    let candidateCount = 0;
    const rows: Row[] = codePoints.map(function (cp) {
        const category = categoryOf(cp);
        const status = statusOf(cp);
        if (status === 'candidate') {
            candidateCount += 1;
        }
        return {
            category,
            count: String(counts.get(cp) ?? 0),
            cp: 'U+' + hex(cp),
            glyph: glyphLabel(cp, category),
            status
        };
    });

    const header: Row = { category: 'CATEGORY', count: 'COUNT', cp: 'CODE POINT', glyph: 'GLYPH', status: 'STATUS' };
    const allRows = [header, ...rows];
    const width = {
        category: Math.max(...allRows.map((r) => r.category.length)),
        count: Math.max(...allRows.map((r) => r.count.length)),
        cp: Math.max(...allRows.map((r) => r.cp.length)),
        glyph: Math.max(...allRows.map((r) => r.glyph.length)),
        status: Math.max(...allRows.map((r) => r.status.length))
    };
    const formatRow = function (r: Row): string {
        return [
            pad(r.cp, width.cp, 'left'),
            pad(r.count, width.count, 'right'),
            pad(r.glyph, width.glyph, 'left'),
            pad(r.category, width.category, 'left'),
            pad(r.status, width.status, 'left')
        ].join('  ');
    };

    logger.info(`Scanned ${scannedCount} file(s). ${counts.size} unique character(s), ${totalChars} total.`);
    logger.log('');
    logger.log(formatRow(header));
    for (const row of rows) {
        logger.log(formatRow(row));
    }
    logger.log('');
    if (candidateCount > 0) {
        logger.warn(`${candidateCount} candidate character(s) not yet handled by the DETECTORS table.`);
    } else {
        logger.success('No candidate characters: every non-ASCII character is already handled by the DETECTORS table.');
    }
};

// Unknown args are ignored, for parity with the sibling guard (block-characters.ts).
const includeExempt = process.argv.slice(2).includes('--include-exempt');
main(includeExempt);
