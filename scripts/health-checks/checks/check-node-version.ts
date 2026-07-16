#!/usr/bin/env node

/* eslint-disable n/no-process-exit */

// Reports a mismatch between the Node.js version in use and the one pinned in .nvmrc, nudging the user to
// run "nvm use". A bare version in .nvmrc (e.g. "1.2.34") is treated by semver as an exact match.
//
// Skipped in CI: .github/workflows/ci.yml deliberately runs the suite across a matrix of Node versions,
// so a single-version .nvmrc gate is meaningless there. This is a local "run nvm use" nudge.
//
// Usage:
//     $ ./check-node-version.ts                    # exits 1 on mismatch (used by the health-check suite)
//     $ ./check-node-version.ts --exit-with-code-0 # warns only (always exits 0)

import fs from 'node:fs';
import path from 'node:path';

import semver from 'semver';

import { logger } from '../../../utils/logger.ts';

const __dirname = import.meta.dirname;

// CI tests against several Node versions on purpose (see header); enforcing one exact version there would
// fail every matrix job. Skip the check in CI; it stays a hard gate locally / in the git hooks.
if (process.env.CI) {
    process.exit(0);
}

const exitWithCode0 = process.argv.includes('--exit-with-code-0');

const exitWithAppropriateCode = function (exitCode: number) {
    process.exit(exitWithCode0 ? 0 : exitCode);
};

const nodeVersion = process.versions.node;
const loggerWarnOrError = exitWithCode0 ? logger.warn : logger.error;

try {
    const dotNvmrcPath = path.resolve(__dirname, '..', '..', '..', '.nvmrc');
    const dotNvmrcContents = fs.readFileSync(dotNvmrcPath, 'utf8').trim();
    if (!semver.satisfies(nodeVersion, dotNvmrcContents)) {
        logger.log('');
        logger.success(' ✔    .nvmrc suggests: Node JS ' + dotNvmrcContents);
        loggerWarnOrError(' ✘ Version being used: Node JS ' + nodeVersion);
        loggerWarnOrError('\nWe might want to run:');
        loggerWarnOrError('    $ nvm use\n');
        exitWithAppropriateCode(1);
    }
} catch {
    loggerWarnOrError('\nWarning: Unable to read the .nvmrc file\n');
    exitWithAppropriateCode(1);
}
