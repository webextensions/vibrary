// Single source of truth for the files the non-keyboard-character tooling skips - the file-level
// counterpart to characters.ts (which is the source of truth for the character lists). Both the guard
// (block-characters.ts) and the census (detect-all-characters.ts) import EXEMPTED_FILES so the two
// scripts cannot drift on which files are exempt.
//
// Each entry carries a `matches(relPath)` predicate - the guard and census ask each entry whether a
// given repo-relative path is exempt rather than comparing against a fixed set of exact paths.
//
// Every entry also carries a scope flag:
//   - The guard skips EVERY entry, for both its scan (check / --suppress) and its --fix.
//   - The census skips only the entries flagged `appliesToCensus` (re-includable with --include-exempt);
//     entries flagged false stay in the census so they remain visible in that diagnostic.
//
// Paths are computed at load time (not hard-coded) so an entry survives a file move. This module lives
// beside characters.ts, so the project root is four levels up - matching block-characters.ts.

import path from 'node:path';

interface ExemptedFile {
    matches: (relPath: string) => boolean; // repo-relative POSIX path
    pattern: string;                        // documentary: the path / subtree / glob the entry represents
    reason: string;                         // why it is exempt (documentary)
    appliesToCensus: boolean                // true: the census skips it too by default; false: the census still counts it
}

const __dirname = import.meta.dirname;
const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');

const toRepoRelativePosix = function (absPath: string): string {
    return path.relative(projectRoot, absPath).split(path.sep).join('/');
};

// Exempt a single file by its exact repo-relative path.
const exactFile = function (absPath: string, reason: string, appliesToCensus: boolean): ExemptedFile {
    const rel = toRepoRelativePosix(absPath);
    return { matches: (p) => p === rel, pattern: rel, reason, appliesToCensus };
};

const EXEMPTED_FILES: readonly ExemptedFile[] = [
    exactFile(
        path.join(projectRoot, '.block-non-keyboard-characters.suppressions.json'),
        'baseline keys embed the suppressed glyphs themselves; --fix must never rewrite them',
        true
    ),
    exactFile(
        path.join(__dirname, 'characters.ts'),
        'shared character table; intentionally holds the literal glyph for every detector',
        true
    ),
    exactFile(
        path.join(projectRoot, 'CHANGELOG.md'),
        'generated from git history by auto-changelog; its punctuation is out of guard scope',
        false
    )
];

export { EXEMPTED_FILES };
