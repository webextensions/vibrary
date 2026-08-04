// Single source of truth for WHICH files the non-keyboard-character tooling skips - the file-level
// counterpart to characters.ts (which is the source of truth for the character lists). Both the guard
// (block-characters.ts) and the census (detect-all-characters.ts) import their skip predicates from
// here so the two scripts cannot drift.
//
// Exemptions come in two layers:
//
//   - Hard-coded invariants (INVARIANT_EXEMPT_FILES): the suppressions file itself (its baseline keys
//     embed the suppressed glyphs, so --fix must never rewrite it and --suppress must never record a
//     self-entry) and characters.ts (intentionally holds the literal glyph for every detector). These
//     are deliberately NOT configurable - removing them would corrupt the tooling's own data.
//   - Config entries: the "exemptions" array in .block-non-keyboard-characters.suppressions.json
//     (shape and validation in suppressions-file.ts).
//
// Config matching semantics: entries are ORDERED and the LAST entry whose pattern matches a given
// repo-relative POSIX file path decides; a leading "!" re-includes. Patterns are plain globs anchored
// at the repo root (subtrees are written "dir/**", any-depth basenames "**/name"). Because files are
// matched individually (never pruned per directory), a single "!" entry re-includes a file at any
// depth under an excluded subtree - no gitignore-style per-parent-level unignoring.
//
// Census scope: the guard skips every exempt file; the census skips only the invariants and the
// entries whose skipInCensus is not false, so entries with "skipInCensus": false stay visible in
// that diagnostic (re-includable wholesale with --include-exempt).

import path from 'node:path';

import type { ExemptionEntry } from './suppressions-file.ts';
import {
    readSuppressionsFile,
    suppressionsRelativePath
} from './suppressions-file.ts';

interface ExemptionVerdict {
    exempt: boolean;        // the guard (scan / --fix / --suppress) skips the file
    skipInCensus: boolean   // the census skips it too (false for "skipInCensus": false entries)
}

const __dirname = import.meta.dirname;
const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');

// The non-configurable exemptions (see the header). Paths are computed at load time (not hard-coded
// strings) so an entry survives a file move.
const INVARIANT_EXEMPT_FILES: ReadonlySet<string> = new Set([
    suppressionsRelativePath,
    path.relative(projectRoot, path.join(__dirname, 'characters.ts')).split(path.sep).join('/')
]);

// Evaluate the ordered config entries for one repo-relative POSIX path: the LAST matching entry wins,
// "!" entries re-include. Pure (entries in, verdict out) so tests can exercise it directly.
const evaluateExemptions = function (entries: readonly ExemptionEntry[], relPath: string): ExemptionVerdict {
    let winner: ExemptionEntry | null = null;
    for (const entry of entries) {
        const negated = entry.pattern.startsWith('!');
        const glob = negated ? entry.pattern.slice(1) : entry.pattern;
        if (path.matchesGlob(relPath, glob)) {
            winner = negated ? null : entry;
        }
    }
    if (winner === null) {
        return { exempt: false, skipInCensus: false };
    }
    return { exempt: true, skipInCensus: winner.skipInCensus !== false };
};

let configuredExemptions: readonly ExemptionEntry[] | null = null;

// One verdict per path: the invariants first (structurally non-overridable by config), then the
// ordered config entries. The config is read lazily on first use, so importing this module (e.g.
// for the pure evaluateExemptions) never touches the suppressions file.
const evaluateFile = function (relPath: string): ExemptionVerdict {
    if (INVARIANT_EXEMPT_FILES.has(relPath)) {
        return { exempt: true, skipInCensus: true };
    }
    configuredExemptions ??= readSuppressionsFile().exemptions;
    return evaluateExemptions(configuredExemptions, relPath);
};

// The guard skips every exempt file - for its scan (check / --suppress) and its --fix.
const isExemptFromGuard = function (relPath: string): boolean {
    return evaluateFile(relPath).exempt;
};

// The census skips the invariants and the entries whose skipInCensus is not false (see the header).
const isExemptFromCensus = function (relPath: string): boolean {
    return evaluateFile(relPath).skipInCensus;
};

export {
    evaluateExemptions,
    isExemptFromCensus,
    isExemptFromGuard
};
