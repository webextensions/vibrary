#!/usr/bin/env node

/* eslint-disable n/no-process-exit */

// Verifies that every local "<branch>-flat" mirror is in sync with the branch it mirrors. A flat
// branch is generated output (scripts/branching/flatten-branch.sh; rationale and workflow:
// docs/template-project/flat-branches.md), so it can silently fall behind as soon as anything is
// committed on its source branch.
//
// Two assertions per mirror:
//     - Same content: the mirror's tree sha equals the source's tree sha.
//     - Not stale: the mirror tip's "Template-Source-Commit" trailer equals the source tip.
//
// Read-only by design - it never moves a ref. Mirrors are optional per checkout: with no "*-flat"
// branches locally (the usual case, and CI), it passes.
//
// Usage (from the project's root folder):
//     $ node --run branching:check-flat-branches

import path from 'node:path';

import { execa } from 'execa';

import { logger } from '../../utils/logger.ts';

const projectRoot = path.resolve(import.meta.dirname, '..', '..');

const TRAILER_KEY = 'Template-Source-Commit';
const FLAT_BRANCH_SUFFIX = '-flat';

const gitAsync = async function (args: string[]): Promise<string | null> {
    const result = await execa('git', args, {
        cwd: projectRoot,
        reject: false
    });
    if (result.exitCode !== 0) {
        return null;
    }
    return (result.stdout || '').trim();
};

const getFlatBranchesAsync = async function (): Promise<string[]> {
    const stdout = await gitAsync(['for-each-ref', '--format=%(refname:short)', `refs/heads/*${FLAT_BRANCH_SUFFIX}`]);
    if (!stdout) {
        return [];
    }
    return stdout.split('\n').filter(function (line) {
        return line.trim() !== '';
    });
};

// The source commit the mirror was last built up to, read from its tip commit message's trailer.
const getLastSyncedSourceCommitAsync = async function (flatBranch: string): Promise<string | null> {
    const message = await gitAsync(['log', '-1', '--format=%B', flatBranch]);
    if (message === null) {
        return null;
    }

    const trailerLines = message.split('\n').filter(function (line) {
        return line.startsWith(`${TRAILER_KEY}: `);
    });
    if (trailerLines.length === 0) {
        return null;
    }

    return (trailerLines.at(-1) as string).slice(`${TRAILER_KEY}: `.length).trim();
};

const flatBranches = await getFlatBranchesAsync();

if (flatBranches.length === 0) {
    process.exit(0);
}

const problems: string[] = [];

for (const flatBranch of flatBranches) {
    const sourceBranch = flatBranch.slice(0, -FLAT_BRANCH_SUFFIX.length);

    // Concatenated rather than interpolated: git's "^{commit}" / "^{tree}" peel syntax would read as
    // a botched "${...}" to eslint (unicorn/no-incorrect-template-string-interpolation).
    const sourceCommit = await gitAsync(['rev-parse', '--verify', 'refs/heads/' + sourceBranch + '^{commit}']);
    if (sourceCommit === null) {
        problems.push(`${flatBranch}: its source branch "${sourceBranch}" does not exist locally.`);
        continue;
    }

    const sourceTree = await gitAsync(['rev-parse', 'refs/heads/' + sourceBranch + '^{tree}']);
    const flatTree = await gitAsync(['rev-parse', 'refs/heads/' + flatBranch + '^{tree}']);
    if (sourceTree !== flatTree) {
        problems.push(`${flatBranch}: content differs from "${sourceBranch}" (run "git diff ${sourceBranch} ${flatBranch}" to see what).`);
        continue;
    }

    const lastSyncedSourceCommit = await getLastSyncedSourceCommitAsync(flatBranch);
    if (lastSyncedSourceCommit === null) {
        problems.push(`${flatBranch}: its tip has no "${TRAILER_KEY}" trailer, so it was not produced by "node --run branching:flatten".`);
    } else if (lastSyncedSourceCommit !== sourceCommit) {
        problems.push(`${flatBranch}: behind "${sourceBranch}" - last mirrored ${lastSyncedSourceCommit.slice(0, 8)}, source is now at ${sourceCommit.slice(0, 8)}.`);
    }
}

if (problems.length > 0) {
    logger.error('\nOne or more flat mirror branches are out of sync with their source branch:\n');
    for (const problem of problems) {
        console.error('    * ' + problem);
    }
    logger.error('\nBring a mirror up to date with:');
    logger.error('    $ node --run branching:flatten -- --source <branch> --target <branch>-flat');
    logger.error('\nOr refresh every existing template-* mirror at once:');
    logger.error('    $ node --run template:flatten-branches');
    logger.error('\nSee docs/template-project/flat-branches.md\n');
    process.exit(1);
}
