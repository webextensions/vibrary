#!/usr/bin/env node

/* eslint-disable n/no-process-exit */

// Detects non-keyboard characters that are commonly inserted by AI-generated text - em dash, en dash, curly quotes,
// ellipsis, plus heavy/ballot tick marks and the bullet. These characters survive review because they look like
// normal punctuation but are not present on a US-layout keyboard.
//
// The script compares observed counts against the "baseline" section of
// `.block-non-keyboard-characters.suppressions.json` and fails if any file's per-character counts differ from it.
// This lets pre-existing intentional uses (docs, quoted prose, etc.) live in the codebase while still catching
// new drift. The same file's "exemptions" section lists files the tooling skips entirely (matching semantics in
// exempted-files.ts, file shape in suppressions-file.ts).
//
// Usage:
//     $ ./block-characters.ts                    # check, exit 1 on mismatch
//     $ ./block-characters.ts --exit-with-code-0 # exit 0 even when non-keyboard characters are found
//     $ ./block-characters.ts --fix              # rewrite safe replacements in-place
//     $ ./block-characters.ts --suppress         # rewrite the baseline section to current counts
//     $ ./block-characters.ts --file <path>      # scope check/--fix to specific file(s) (repeatable);
//                                                #   honors the same skips as the whole-repo scan
//                                                #   (node_modules, outside-repo, gitignored). Cannot
//                                                #   be combined with --suppress (which is whole-repo).

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { logger } from '../../../../utils/logger.ts';
import {
    getTrackedFiles,
    readFileAsTextOrNull
} from '../../../utils/repo-files.ts';
import { DETECTORS } from './characters.ts';
import { isExemptFromGuard } from './exempted-files.ts';
import type {
    CountsByChar,
    CountsByFile
} from './suppressions-file.ts';
import {
    readSuppressionsFile,
    suppressionsRelativePath,
    writeBaseline
} from './suppressions-file.ts';

const __dirname = import.meta.dirname;
const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
// The guard skips every exempt file - for both its scan (check / --suppress) and its --fix; which
// files those are (and why) lives in exempted-files.ts, the shared source of truth with the census.

interface Violation {
    actual: number;
    char: string;
    expected: number
}

// Resolve raw `--file` arguments to repo-relative POSIX paths, dropping any that fall outside the
// "files that belong in the repo" view used by the whole-repo scan: paths outside the project root,
// paths inside `node_modules`, and gitignored paths. This keeps per-file mode faithful to the default
// behavior (and means a guarded path becomes a clean no-op rather than an unexpected rewrite).
const resolveTargetFiles = function (rawPaths: string[]): string[] {
    const resolved: string[] = [];
    for (const rawPath of rawPaths) {
        const absPath = path.resolve(process.cwd(), rawPath);
        const relativePath = path.relative(projectRoot, absPath).split(path.sep).join('/');
        if (relativePath === '' || relativePath.startsWith('..')) {
            continue;
        }
        if (relativePath.split('/').includes('node_modules')) {
            continue;
        }
        // `git check-ignore -q` exits 0 when the path IS ignored, 1 when it is not.
        const ignored = spawnSync('git', ['check-ignore', '-q', '--', relativePath], { cwd: projectRoot });
        if (ignored.status === 0) {
            continue;
        }
        resolved.push(relativePath);
    }
    return [...new Set(resolved)].toSorted();
};

const countCharsInFile = function (relativePath: string): CountsByChar {
    const absPath = path.join(projectRoot, relativePath);
    const content = readFileAsTextOrNull(absPath);
    if (content === null) {
        return {};
    }
    const counts: CountsByChar = {};
    for (const detector of DETECTORS) {
        const n = content.split(detector.char).length - 1;
        if (n > 0) {
            counts[detector.char] = n;
        }
    }
    return counts;
};

const collectAllCounts = function (files: string[]): CountsByFile {
    const all: CountsByFile = {};
    for (const file of files) {
        // Skip the EXEMPT_FILES (see exempted-files.ts for the list and why each file is exempt). This
        // guard's own source is intentionally NOT skipped - it is scanned like any other file and its
        // counts are handled by the baseline. The suppressions baseline itself IS exempt (its keys
        // embed the suppressed glyphs).
        if (isExemptFromGuard(file)) {
            continue;
        }
        const counts = countCharsInFile(file);
        if (Object.keys(counts).length > 0) {
            all[file] = counts;
        }
    }
    return all;
};

const compareCounts = function (actual: CountsByChar, expected: CountsByChar): Violation[] {
    const allChars = new Set([...Object.keys(actual), ...Object.keys(expected)]);
    const violations: Violation[] = [];
    for (const ch of [...allChars].toSorted()) {
        const actualCount = actual[ch] || 0;
        const expectedCount = expected[ch] || 0;
        if (actualCount !== expectedCount) {
            violations.push({ actual: actualCount, char: ch, expected: expectedCount });
        }
    }
    return violations;
};

const runCheck = function (files: string[], scopedFiles: string[] | null): number {
    const { baseline } = readSuppressionsFile();
    const actualByFile = collectAllCounts(files);

    // In whole-repo mode, report on the union of files that have counts and files in the baseline.
    // In per-file (scoped) mode, report ONLY on the targeted files - otherwise every other baseline
    // entry would look like a violation (actual 0 vs expected N) since those files were not scanned.
    let filesToReport: string[];
    if (scopedFiles) {
        filesToReport = [...new Set(scopedFiles)].toSorted();
    } else {
        filesToReport = [...new Set([...Object.keys(actualByFile), ...Object.keys(baseline)])].toSorted();
    }
    const offenders: { file: string; violations: Violation[] }[] = [];
    for (const file of filesToReport) {
        const actual = actualByFile[file] || {};
        const expected = baseline[file] || {};
        const violations = compareCounts(actual, expected);
        if (violations.length > 0) {
            offenders.push({ file, violations });
        }
    }

    if (offenders.length === 0) {
        logger.success('Non-keyboard characters: all files match the suppressions baseline.');
        return 0;
    }

    logger.error(`Non-keyboard characters: ${offenders.length} file(s) differ from the baseline:`);
    for (const { file, violations } of offenders) {
        logger.error(`  ${file}`);
        for (const violation of violations) {
            const delta = violation.actual - violation.expected;
            const sign = delta > 0 ? '+' : '';
            logger.error(`      ${violation.char}  expected ${violation.expected}, found ${violation.actual}  (${sign}${delta})`);
        }
    }
    logger.warn('');
    logger.warn('Run "node --run block-non-keyboard-characters:fix" to auto-replace common chars, then');
    logger.warn('run "node --run block-non-keyboard-characters:suppress" to update the baseline.');
    return 1;
};

const runFix = function (files: string[], scopedFiles: string[] | null): number {
    const { baseline } = readSuppressionsFile();
    let changedCount = 0;
    for (const file of files) {
        if (isExemptFromGuard(file)) {
            continue;
        }
        // Skip files listed in the baseline - their non-keyboard chars are intentional
        // (docs, quoted prose, fixtures, etc.) and were captured via --suppress on purpose.
        if (Object.hasOwn(baseline, file)) {
            continue;
        }
        const absPath = path.join(projectRoot, file);
        const original = readFileAsTextOrNull(absPath);
        if (original === null) {
            continue;
        }
        let updated = original;
        for (const detector of DETECTORS) {
            if (detector.replacement === null) {
                continue;
            }
            if (updated.includes(detector.char)) {
                updated = updated.replaceAll(detector.char, () => detector.replacement);
            }
        }
        if (updated !== original) {
            try {
                fs.writeFileSync(absPath, updated);
            } catch (err) {
                const code = (err as NodeJS.ErrnoException).code;
                if (code !== 'EACCES' && code !== 'EPERM') {
                    throw err;
                }
                // Read-only files cannot be written as-is. Temporarily clear the read-only attribute so the fix can
                // apply, then restore the original mode.
                const originalMode = fs.statSync(absPath).mode;
                // eslint-disable-next-line no-bitwise
                fs.chmodSync(absPath, originalMode | 0o200);
                try {
                    fs.writeFileSync(absPath, updated);
                } finally {
                    fs.chmodSync(absPath, originalMode);
                }
            }
            logger.info(`Fixed: ${file}`);
            changedCount += 1;
        }
    }
    if (changedCount === 0) {
        logger.success('Non-keyboard characters: no fixes needed.');
    } else {
        logger.success(`Non-keyboard characters: rewrote ${changedCount} file(s).`);
    }
    return runCheck(files, scopedFiles);
};

const runSuppress = function (files: string[]): number {
    const all = collectAllCounts(files);
    writeBaseline(all);
    const fileCount = Object.keys(all).length;
    logger.success(`Non-keyboard characters: wrote baseline for ${fileCount} file(s) to ${suppressionsRelativePath}`);
    return 0;
};

const argv = process.argv.slice(2);
const rawFileArgs: string[] = [];
let flagFix = false;
let flagSuppress = false;
let flagExitWithCode0 = false;
for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--fix') {
        flagFix = true;
    } else if (arg === '--suppress') {
        flagSuppress = true;
    } else if (arg === '--exit-with-code-0') {
        flagExitWithCode0 = true;
    } else if (arg === '--file') {
        const next = argv[i + 1];
        if (next !== undefined) {
            rawFileArgs.push(next);
            i += 1;
        }
    } else if (arg.startsWith('--file=')) {
        rawFileArgs.push(arg.slice('--file='.length));
    }
    // Other (unknown) args are ignored.
}

if (flagFix && flagSuppress) {
    logger.error('Error: --fix and --suppress are mutually exclusive');
    process.exit(2);
}

const flagScoped = rawFileArgs.length > 0;
if (flagSuppress && flagScoped) {
    logger.error('Error: --suppress operates on the whole repo and cannot be combined with --file');
    process.exit(2);
}

const targetFiles = flagScoped ? resolveTargetFiles(rawFileArgs) : null;
const filesToProcess = targetFiles ?? getTrackedFiles(projectRoot);

let exitCode;
if (flagFix) {
    exitCode = runFix(filesToProcess, targetFiles);
} else if (flagSuppress) {
    exitCode = runSuppress(filesToProcess);
} else {
    exitCode = runCheck(filesToProcess, targetFiles);
}

process.exit(flagExitWithCode0 ? 0 : exitCode);
