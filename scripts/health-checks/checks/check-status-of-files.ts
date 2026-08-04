#!/usr/bin/env node

/* eslint-disable n/no-process-exit */

// Verifies file status expectations (read-only paths, etc.). Rules: status-of-files.config.ts
//
// Usage:
//     $ ./check-status-of-files.ts
//     $ ./check-status-of-files.ts --return-exit-code

// FUTURE: In future, we might want to add more checks here, like ensuring file-size, mtime, etc.

import fs from 'node:fs';
import path from 'node:path';

import { logger } from '../../../utils/logger.ts';
import { readOnlyPaths } from './status-of-files.config.ts';

const __dirname = import.meta.dirname;
const projectRoot = path.resolve(__dirname, '..', '..', '..');

const returnExitCode = (process.argv[2] === '--return-exit-code');
const loggerWarnOrError = returnExitCode ? logger.error : logger.warn;

let exitCode = 0;

for (const relativePath of readOnlyPaths) {
    const absPath = path.join(projectRoot, relativePath);
    try {
        // Read the permission mode bits directly rather than fs.accessSync(W_OK).
        // The root user bypasses W_OK (access reports writable even on a 0o444 file),
        // so access-based checks are unreliable in root containers such as Claude
        // Code on the web. Mode bits are uid-independent: read-only means no write
        // bit is set for user/group/other. statSync also gives us existence in the
        // same call, so a missing file surfaces here as ENOENT.
        const mode = fs.statSync(absPath).mode;
        /* eslint-disable-next-line no-bitwise -- mask Unix write permission bits (any of user/group/other), same precedent as ensure-status-of-files.ts */
        if ((mode & 0o222) !== 0) {
            loggerWarnOrError(`\n${relativePath} should be read-only.\n`);
            exitCode = 1;
        }
    } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'ENOENT') {
            loggerWarnOrError(`\nWarning: ${relativePath} is missing\n`);
            exitCode = 1;
            continue;
        }
        throw err;
    }
}

if (exitCode === 1) {
    loggerWarnOrError('\nRun:\n    $ ./scripts/health-checks/checks/ensure-status-of-files.ts\n');
}

if (returnExitCode) {
    process.exit(exitCode);
}
process.exit(0);
