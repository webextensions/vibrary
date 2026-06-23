// git `diff.truths-canon.command` driver, bound to truth files by .gitattributes. git hands us both sides of a diff:
//   node scripts/truths-diff.js <path> <old-file> <old-hex> <old-mode> <new-file> <new-hex> <new-mode>
// (a side is /dev/null for an add or delete). We decide what to show:
//   - if the two sides canonicalize (sort everything) to identical text -> a pure reordering -> emit nothing -> git
//     shows no diff for the file;
//   - otherwise -> emit the full, unminimized unified diff of the RAW files, in their real on-disk order.
// The files on disk are never touched; git status, staging, and commits all use the bytes as written.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { canonicalize } from './canonicalize-truths.js';

const readMaybe = function (file) {
    try {
        return readFileSync(file, 'utf8');
    } catch {
        // /dev/null (add/delete) or otherwise unreadable - treat as empty.
        return '';
    }
};

const toCanonical = function (xml) {
    try {
        return canonicalize(xml);
    } catch {
        // Malformed XML - compare the raw bytes instead so we never error out.
        return xml;
    }
};

const main = function () {
    const path = process.argv[2];
    const oldFile = process.argv[3];
    const newFile = process.argv[6];

    if (toCanonical(readMaybe(oldFile)) === toCanonical(readMaybe(newFile))) {
        // Semantically identical (pure reordering) - show nothing.
        return;
    }

    // Real difference: show the whole raw diff with standard unified context and the real path as labels.
    const result = spawnSync(
        'diff',
        ['-u', '--label', `a/${path}`, '--label', `b/${path}`, oldFile, newFile],
        { encoding: 'utf8' }
    );

    if (result.stdout) {
        process.stdout.write(result.stdout);
    }

    // `diff` exits 0 (no difference) or 1 (differences); anything higher is a real error worth surfacing.
    if (result.status > 1) {
        process.exitCode = result.status;
    }
};

main();
