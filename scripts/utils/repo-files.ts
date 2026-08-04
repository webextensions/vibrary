// Shared file-scanning primitives used by the non-keyboard-character scripts (the guard
// `block-non-keyboard-characters/block-characters.ts` and the report
// `block-non-keyboard-characters/detect-all-characters.ts`).
// Keeping them here means both scripts agree on which files "belong in the repo" and on how a file's
// text is read (with a binary-file skip).

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

// Enumerate the union of tracked + untracked-not-ignored files via
// `git ls-files --cached --others --exclude-standard`, so newly-created (not-yet-staged) files are scanned too.
// This is a broader "files that belong in the repo" view than the staged-only `eslint:staged-files` script
// (which uses `git diff --cached`).
const getTrackedFiles = function (projectRoot: string): string[] {
    const result = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
        cwd: projectRoot,
        stdio: ['ignore', 'pipe', 'inherit']
    });
    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        // eslint-disable-next-line n/no-process-exit -- one-shot tooling helper: propagate the failure exit code
        process.exit(result.status ?? 1);
    }
    const files = result.stdout.toString('utf8').split('\0').filter(Boolean);
    return [...new Set(files)].toSorted();
};

// Read a file as UTF-8 text, or return null when it does not exist (ENOENT), is not a readable file
// (EISDIR - e.g. a symlink to a directory), or looks binary (contains a
// NUL byte). Callers treat null as "nothing to scan" (the guard returns {} / continues on null).
const readFileAsTextOrNull = function (absPath: string): string | null {
    let buf: Buffer;
    try {
        buf = fs.readFileSync(absPath);
    } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'ENOENT' || code === 'EISDIR') {
            return null;
        }
        throw err;
    }
    if (buf.includes(0)) {
        return null;
    }
    return buf.toString('utf8');
};

export { getTrackedFiles, readFileAsTextOrNull };
