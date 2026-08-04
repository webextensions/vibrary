#!/usr/bin/env node

/* eslint-disable n/no-process-exit */

// Normalizes .claude/settings.json and .claude/settings.local.json: recursively alphabetizes every
// object key (top-level and nested) and sorts + dedupes the permissions.allow and permissions.deny
// arrays.
//
// Why: Claude Code appends "always allow" approvals to the END of the permission arrays during a
// session (leaving them unsorted and occasionally duplicated) and otherwise adds/edits keys over time,
// leaving the rest of the document unordered. This script is the single source of truth for the desired
// order; it backs both the all-is-well "claude-settings-sort" check and the Stop hook
// .claude/hooks/Stop/claude-settings-sort.sh (which runs the --fix mode at the end of each turn).
//
// Scope (by design):
//   - .claude/settings.json (the committed file) and .claude/settings.local.json (gitignored, where
//     Claude Code typically appends "always allow" approvals). An absent file is a skipped no-op, so in
//     CI / git hooks - where settings.local.json does not exist - only the committed file is processed.
//   - Object keys everywhere are sorted. Among arrays, only permissions.allow and permissions.deny are
//     sorted/deduped; every other array keeps its original element order.
//
// Sort order: case-insensitive (localeCompare, base sensitivity), so the existing convention is
// preserved - e.g. Bash(...) < mcp__... < WebFetch(...) < WebSearch (uppercase and lowercase
// interleaved). A codepoint tiebreak keeps case-only neighbours deterministic across engines. The same
// comparator orders both object keys and the permission arrays.
//
// Formatting: each file's indentation is auto-detected from its own text (not hard-coded) and the
// trailing newline is preserved, so a re-serialize only ever reorders lines - no whitespace churn. The
// settings files are plain JSON (no comments), so JSON.parse -> JSON.stringify round-trips the document.
//
// Usage:
//     $ ./claude-settings-sort.ts                    # check, exit 1 if unsorted / has duplicates
//     $ ./claude-settings-sort.ts --exit-with-code-0 # exit 0 even if unsorted / has duplicates
//     $ ./claude-settings-sort.ts --fix              # normalize in place (idempotent)
//
// No-op per file (exit 0): the file is absent, or it is already normalized.

import fs from 'node:fs';
import path from 'node:path';

import { logger } from '../../../utils/logger.ts';

const __dirname = import.meta.dirname;
// Flat file under scripts/health-checks/checks/, so the project root is three levels up. Resolving
// from the script's own location (not cwd) keeps this correct when all-is-well runs it with cwd =
// scripts/health-checks/.
const projectRoot = path.resolve(__dirname, '..', '..', '..');

// The settings files we keep normalized: the committed one and the local (gitignored) one, where Claude
// Code typically appends "always allow" approvals.
const settingsAbsPaths = [
    path.join(projectRoot, '.claude', 'settings.json'),
    path.join(projectRoot, '.claude', 'settings.local.json')
];

const toRelativePath = function (settingsAbsPath: string): string {
    return path.relative(projectRoot, settingsAbsPath).split(path.sep).join('/');
};

// The permission arrays we sort/dedupe. (Decision: "allow" + "deny" only; all other arrays keep order.)
const SORTED_KEYS = ['allow', 'deny'];

const DEFAULT_INDENT = '  '; // 2 spaces, used only if indentation cannot be detected

// Case-insensitive compare, preserving the existing convention (e.g. Bash < mcp < WebFetch). The
// codepoint tiebreak makes case-only differences deterministic (localeCompare base sensitivity treats
// them as equal, and Array.prototype.sort stability is not guaranteed to express the intended order).
const compareEntries = function (a: string, b: string): number {
    const byLocale = a.localeCompare(b, 'en', { sensitivity: 'base' });
    if (byLocale !== 0) {
        return byLocale;
    }
    if (a < b) {
        return -1;
    }
    if (a > b) {
        return 1;
    }
    return 0;
};

// Sort a copy and drop exact-duplicate strings (first occurrence wins; order is irrelevant after the sort).
const sortAndDedupe = function (arr: string[]): string[] {
    return [...new Set(arr)].toSorted(compareEntries);
};

// Detect one indent level from the raw text: the first run of spaces/tabs after a newline. Returns the
// captured whitespace verbatim (JSON.stringify accepts a string "space" and repeats it per level), or
// the 2-space default for single-line / unindented JSON.
const detectIndent = function (text: string): string {
    const match = text.match(/\n([ \t]+)/);
    return match ? match[1] : DEFAULT_INDENT;
};

// Recursively rebuild a parsed JSON value with object keys in compareEntries order. Arrays keep their
// element order (only their elements are recursed into); primitives are returned as-is. The permission
// arrays are sorted separately, before this runs, so element order is already correct for them.
const sortKeysDeep = function (value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map((element) => sortKeysDeep(element));
    }
    if (value && typeof value === 'object') {
        const source = value as Record<string, unknown>;
        const sorted: Record<string, unknown> = {};
        for (const key of Object.keys(source).toSorted(compareEntries)) {
            sorted[key] = sortKeysDeep(source[key]);
        }
        return sorted;
    }
    return value;
};

type Settings = {
    permissions?: Record<string, unknown>;
    [key: string]: unknown
};

interface ComposeResult {
    original: string;
    updated: string
}

// Read one settings file and return the original text alongside a re-serialized version with object
// keys sorted and the permission arrays sorted/deduped. Returns null only when the file is absent.
const composeSortedSettings = function (settingsAbsPath: string): ComposeResult | null {
    let original: string;
    try {
        original = fs.readFileSync(settingsAbsPath, 'utf8');
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            return null;
        }
        throw err;
    }

    const data = JSON.parse(original) as Settings;

    const permissions = data.permissions;
    if (permissions && typeof permissions === 'object') {
        for (const key of SORTED_KEYS) {
            const value = permissions[key];
            if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) {
                permissions[key] = sortAndDedupe(value as string[]);
            }
        }
    }

    const indent = detectIndent(original);
    const trailingNewline = original.endsWith('\n') ? '\n' : '';
    const updated = JSON.stringify(sortKeysDeep(data), null, indent) + trailingNewline;

    return { original, updated };
};

const runCheck = function (): number {
    let exitCode = 0;
    for (const settingsAbsPath of settingsAbsPaths) {
        const settingsRelativePath = toRelativePath(settingsAbsPath);
        const result = composeSortedSettings(settingsAbsPath);
        if (!result) {
            logger.info(`Claude settings: ${settingsRelativePath} not present; skipped.`);
            continue;
        }
        if (result.updated === result.original) {
            logger.success(`Claude settings: ${settingsRelativePath} is sorted.`);
            continue;
        }

        logger.error(`Claude settings: ${settingsRelativePath} needs sorting / deduping.`);
        exitCode = 1;
    }

    if (exitCode !== 0) {
        logger.warn('');
        logger.warn('Run "node --run claude-settings-sort:fix" to normalize them.');
    }
    return exitCode;
};

const runFix = function (): number {
    for (const settingsAbsPath of settingsAbsPaths) {
        const settingsRelativePath = toRelativePath(settingsAbsPath);
        const result = composeSortedSettings(settingsAbsPath);
        if (!result) {
            logger.info(`Claude settings: ${settingsRelativePath} not present; skipped.`);
            continue;
        }
        if (result.updated === result.original) {
            logger.success(`Claude settings: ${settingsRelativePath} already sorted; no changes.`);
            continue;
        }

        fs.writeFileSync(settingsAbsPath, result.updated);
        logger.info(`Sorted: ${settingsRelativePath}`);
    }
    return 0;
};

const argv = new Set(process.argv.slice(2));
const flagFix = argv.has('--fix');
const exitWithCode0 = argv.has('--exit-with-code-0');

const exitCode = flagFix ? runFix() : runCheck();
process.exit(exitWithCode0 ? 0 : exitCode);
