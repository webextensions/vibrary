#!/usr/bin/env node

/* eslint-disable n/no-process-exit */

// Guards the pack-time manifest strip: every npm install-family script (preinstall / install /
// postinstall) declared in the generated package.json must be listed for deletion in
// scripts/npm-run-scripts/prepack.sh, and the prepack/postpack scripts must stay wired in
// package.json - otherwise a published tarball would ship an install script that npm runs on
// consumers' machines (see the header comment in prepack.sh).
//
// Deliberately static (reads files only, never runs "npm pack"): the health-check suite runs
// concurrently, and a real pack would mutate package.json (prepack strip) while sibling checks
// (pkg-json-sync, npm-ci-dry, publint, ...) read it. The end-to-end tarball verification is a
// documented manual step in docs/development/releasing.md.
//
// Usage:
//     $ ./check-prepack-strips-install-scripts.ts # exits 1 on a violation (used by the health-check suite)

import fs from 'node:fs';
import path from 'node:path';

import { logger } from '../../../utils/logger.ts';

const __dirname = import.meta.dirname;

const projectRoot = path.resolve(__dirname, '..', '..', '..');
const packageJsonPath = path.resolve(projectRoot, 'package.json');
const prepackShPath = path.resolve(projectRoot, 'scripts', 'npm-run-scripts', 'prepack.sh');

// The npm lifecycle scripts that npm runs from an installed dependency on a consumer's machine.
const INSTALL_FAMILY_SCRIPT_NAMES = ['install', 'postinstall', 'preinstall'];

try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const scripts = packageJson.scripts || {};
    const prepackShContents = fs.readFileSync(prepackShPath, 'utf8');

    // The keys prepack.sh deletes: "scripts.<name>" tokens on its (non-comment) "npm pkg delete" lines.
    const strippedScriptNames = new Set<string>();
    for (const line of prepackShContents.split('\n')) {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('#') || !trimmedLine.includes('npm pkg delete')) {
            continue;
        }
        for (const match of trimmedLine.matchAll(/scripts\.([\w:-]+)/g)) {
            strippedScriptNames.add(match[1]);
        }
    }

    const problems: string[] = [];

    for (const scriptName of INSTALL_FAMILY_SCRIPT_NAMES) {
        if (Object.hasOwn(scripts, scriptName) && !strippedScriptNames.has(scriptName)) {
            problems.push(`The install-family script "${scriptName}" (package.json.ts) is not stripped by ${prepackShPath} - npm would run it on consumers' machines.`);
        }
    }

    // The strip machinery must stay wired (react/widget-style branches chain prepack with a build
    // step, so match on containment rather than equality).
    for (const scriptName of ['prepack', 'postpack']) {
        const expectedPath = `./scripts/npm-run-scripts/${scriptName}.sh`;
        if (!String(scripts[scriptName] || '').includes(expectedPath)) {
            problems.push(`The "${scriptName}" script in package.json.ts does not run ${expectedPath} - the pack-time manifest strip is unwired.`);
        }
    }

    if (problems.length > 0) {
        logger.log('');
        for (const problem of problems) {
            logger.error(' ✘ ' + problem);
        }
        logger.error('\nFix scripts/npm-run-scripts/prepack.sh and/or package.json.ts (then regenerate package.json).\n');
        process.exit(1);
    }
} catch (err) {
    logger.error('\nError: Unable to verify the pack-time manifest strip (prepack.sh / package.json unreadable?)\n');
    logger.error(err);
    process.exit(1);
}
