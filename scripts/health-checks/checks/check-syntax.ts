#!/usr/bin/env node

/* eslint-disable n/no-process-exit */

// A fast, reliable syntax check across every repo JS/TS source file discovered by
// `git ls-files --cached --others --exclude-standard`. Run as part of the
// health-check suite to catch parse errors (truncated functions, stray tokens, broken refactors) before
// they reach ESLint or the tests - those tools assume parseable input and emit confusing failures when
// it is not. Exits non-zero if any file fails to parse.
//
// Strategy: call `module.stripTypeScriptTypes(source)` on every file. It returns on valid TypeScript and
// throws a real SyntaxError otherwise. Since JS is a subset of TS and type-stripping only replaces type
// positions with whitespace, this also validates .cjs / .js / .mjs.
//
// Skipped: .d.cts / .d.mts / .d.ts (pure types) and .jsx / .tsx (JSX is out of scope).
//
// File discovery reuses the repo's shared getTrackedFiles / readFileAsTextOrNull helpers so it matches
// the non-keyboard-character guard - tracked plus untracked-not-ignored, so brand-new files are checked
// too.
//
// Usage:
//     $ ./check-syntax.ts                    # check, exit 1 on any parse error
//     $ ./check-syntax.ts --exit-with-code-0 # exit 0 even when a file fails to parse
//     $ ./check-syntax.ts --verbose          # also print a per-file pass/fail line
//     $ ./check-syntax.ts --help

import { stripTypeScriptTypes } from 'node:module';
import path from 'node:path';
import { parseArgs } from 'node:util';

import {
    getTrackedFiles,
    readFileAsTextOrNull
} from '../../utils/repo-files.ts';

const __dirname = import.meta.dirname;
const projectRoot = path.resolve(__dirname, '..', '..', '..');

const { values: cliOptions } = parseArgs({
    options: {
        help: { type: 'boolean', short: 'h', default: false },
        verbose: { type: 'boolean', short: 'v', default: false },
        'exit-with-code-0': { type: 'boolean', default: false }
    },
    strict: true
});

if (cliOptions.help) {
    console.log(
        [
            'Usage: check-syntax.ts [options]',
            '',
            'Validates the syntax of every repo .cjs / .cts / .js / .mjs / .mts / .ts file discovered by git ls-files --cached --others --exclude-standard (excluding .d.cts / .d.mts / .d.ts and .jsx / .tsx).',
            '',
            'Options:',
            '  -h, --help               Show this help message and exit',
            '  -v, --verbose            Print a per-file pass/fail line in addition to errors',
            '      --exit-with-code-0   Exit 0 even on parse failures (default is to exit non-zero)'
        ].join('\n')
    );
    process.exit(0);
}

const verbose = cliOptions.verbose;

// `stripTypeScriptTypes` is documented but emits an "experimental" warning on first use. The API surface
// used here is trivial (string in, throws on parse error) - quiet that one warning to keep output clean.
const originalProcessEmit = process.emit;
process.emit = function (this: NodeJS.Process, eventName: string | symbol, payload?: unknown, ...rest: unknown[]) {
    if (
        eventName === 'warning' &&
        payload &&
        (payload as { name?: string }).name === 'ExperimentalWarning' &&
        typeof (payload as { message?: string }).message === 'string' &&
        (payload as { message: string }).message.includes('stripTypeScriptTypes')
    ) {
        return false;
    }
    // eslint-disable-next-line unicorn/no-this-outside-of-class -- "this" must be forwarded to the original process.emit
    return (originalProcessEmit as (...args: unknown[]) => boolean).call(this, eventName, payload, ...rest);
} as typeof process.emit;

const extensions = new Set(['cjs', 'cts', 'js', 'mjs', 'mts', 'ts']);
const files = getTrackedFiles(projectRoot).filter((file) => {
    if (/\.d\.[cm]?ts$/.test(file)) {
        return false;
    }
    const ext = file.split('.').pop();
    return Boolean(ext) && extensions.has(ext as string);
});

// `stripTypeScriptTypes` populates `err.stack` with a rich syntax-error report - file:line header, the
// offending source line, a column caret, a context line, then the SyntaxError summary. After that come
// internal stack frames (`at parseTypeScript ...`, etc.) which are noise; strip those frames, keep the rest.
const formatStripError = function (err: unknown): string {
    const stack = (err as { stack?: string } | null)?.stack || '';
    const usefulLines = stack
        .split('\n')
        .filter((line) => !/^\s+at\s/.test(line));
    while (usefulLines.length > 0 && (usefulLines.at(-1) as string).trim() === '') {
        usefulLines.pop();
    }
    if (usefulLines.length > 0) {
        return usefulLines.join('\n');
    }
    return (err as { message?: string } | null)?.message || String(err);
};

const checkFile = function (relativePath: string): boolean {
    const source = readFileAsTextOrNull(path.join(projectRoot, relativePath));
    if (source === null) {
        // Missing or binary - nothing to parse.
        return true;
    }
    try {
        // `sourceUrl` makes the file path appear in `err.stack`'s first line (`<file>:<line>`).
        stripTypeScriptTypes(source, { mode: 'strip', sourceUrl: relativePath });
        return true;
    } catch (err) {
        console.error(formatStripError(err));
        return false;
    }
};

let failed = false;
for (const file of files) {
    const ok = checkFile(file);

    if (!ok) {
        failed = true;
    }

    if (verbose) {
        if (ok) {
            console.log(` ✔ Syntax OK: ${file}`);
        } else {
            console.log(` ✘ Syntax Error: ${file}`);
        }
    }
}

if (failed) {
    console.error('Syntax errors found');
}

process.exit(failed && !cliOptions['exit-with-code-0'] ? 1 : 0);
