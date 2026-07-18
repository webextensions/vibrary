#!/usr/bin/env node

// Smoke-test the packed tarball the way an end user consumes it. The project's one recurring packaging trap is a
// runtime import outside the shipped `files` list, or a backend-reachable package left in devDependencies: everything
// keeps working from the repo (the full tree and node_modules are present) while the installed package is broken -
// this has happened. So: `npm pack` the tarball, install it with --omit=dev into a scratch folder OUTSIDE the repo
// (so Node's resolution walking up the tree cannot borrow the repo's own node_modules), start the installed server
// against a scratch vibrary folder, and hit the two endpoints that exercise the runtime import graph - /api/files and
// /api/files-summary (the latter parses files through shared/vibraryXmlCore.js, the exact past breakage).
//
// The internal `npm pack` runs with --ignore-scripts so prepack's check suite does not re-run (or recurse when this
// script itself is wired into prepack); the tarball therefore ships the CURRENT dist/, which prepack has just built
// when invoked from there. Standalone runs must build first - the dist check below makes that failure mode explicit.

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SERVER_START_TIMEOUT_MS = 30 * 1000;

const FIXTURE_SPECS_XML = [
    '<root>',
    '    <entries>',
    '        <entry type="spec">',
    '            <title>smoke-test-entry</title>',
    '            <content>Present so the summary endpoint has something to parse.</content>',
    '        </entry>',
    '    </entries>',
    '</root>',
    ''
].join('\n');

// The fetch responses are asserted structurally below; `any` keeps the checkJs pass out of the way of that.
/** @returns {Promise<any>} */
const fetchJsonAsync = async function (url) {
    const response = await fetch(url);
    return response.json();
};

const scratchRoot = mkdtempSync(path.join(tmpdir(), 'vibrary-smoke-'));
let child = null;

try {
    if (!existsSync(path.join(repoRoot, 'dist', 'index.html'))) {
        throw new Error('dist/ is missing or incomplete - run `node --run build` first (prepack does this automatically).');
    }

    console.log('Packing the tarball (--ignore-scripts; dist/ is shipped as-is)...');
    const packOutput = execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', scratchRoot], { cwd: repoRoot, encoding: 'utf8' });
    const tarballPath = path.join(scratchRoot, JSON.parse(packOutput)[0].filename);

    console.log('Installing it with --omit=dev into a scratch consumer folder...');
    const consumerDirectory = path.join(scratchRoot, 'consumer');
    mkdirSync(consumerDirectory);
    // A stub manifest pins the install here; without one npm would walk up and mutate the nearest package.json.
    writeFileSync(path.join(consumerDirectory, 'package.json'), JSON.stringify({ name: 'vibrary-smoke-consumer', private: true }));
    execFileSync('npm', ['install', tarballPath, '--omit=dev', '--no-audit', '--no-fund'], { cwd: consumerDirectory, stdio: 'inherit' });

    const servedDirectory = path.join(scratchRoot, 'served');
    mkdirSync(servedDirectory);
    writeFileSync(path.join(servedDirectory, '.vibraryinclude'), 'specs*.xml\n');
    writeFileSync(path.join(servedDirectory, 'specs.xml'), FIXTURE_SPECS_XML);

    console.log('Starting the installed server against the scratch folder...');
    const serverBin = path.join(consumerDirectory, 'node_modules', 'vibrary', 'bin', 'vibrary-server.js');
    child = spawn(process.execPath, [serverBin, '--no-open', '--port', '3901'], { cwd: servedDirectory });

    // The server advances to the next free port if the preferred one is busy, so the printed startup line - not the
    // requested port - is the source of truth for where it actually listens.
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', function (chunk) { stdout += chunk; });
    child.stderr.on('data', function (chunk) { stderr += chunk; });

    const startedAt = Date.now();
    let url = null;
    while (url === null) {
        const match = stdout.match(/vibrary-server running at (http:\/\/localhost:\d+\/)/);
        if (match) {
            url = match[1];
        } else if (child.exitCode !== null) {
            throw new Error(`the installed server exited with code ${child.exitCode} before starting.\nstdout:\n${stdout}\nstderr:\n${stderr}`);
        } else if (Date.now() - startedAt > SERVER_START_TIMEOUT_MS) {
            throw new Error(`the installed server did not start within ${SERVER_START_TIMEOUT_MS / 1000}s.\nstdout:\n${stdout}\nstderr:\n${stderr}`);
        } else {
            await delay(200);
        }
    }

    console.log(`Server is up at ${url} - checking /api/files...`);
    const filesEnvelope = await fetchJsonAsync(`${url}api/files`);
    if (filesEnvelope.status !== 'success' || !filesEnvelope.output.files.includes('specs.xml')) {
        throw new Error(`/api/files did not list the fixture file: ${JSON.stringify(filesEnvelope)}`);
    }

    console.log('Checking /api/files-summary (exercises the shared/vibraryXmlCore.js runtime import)...');
    const summaryEnvelope = await fetchJsonAsync(`${url}api/files-summary`);
    const specsSummary = summaryEnvelope.status === 'success' ?
        summaryEnvelope.output.files.find(function (/** @type {{name: string}} */ file) { return file.name === 'specs.xml'; }) :
        undefined;
    if (specsSummary === undefined || specsSummary.total !== 1 || !specsSummary.titles.includes('smoke-test-entry')) {
        throw new Error(`/api/files-summary did not parse the fixture entry: ${JSON.stringify(summaryEnvelope)}`);
    }

    console.log('Checking /api/docs/editor.md (the Help dialog\'s Guide needs docs/*.md in the tarball)...');
    const manualEnvelope = await fetchJsonAsync(`${url}api/docs/editor.md`);
    if (manualEnvelope.status !== 'success' || typeof manualEnvelope.output.content !== 'string' || manualEnvelope.output.content.length === 0) {
        throw new Error(`/api/docs/editor.md did not serve the shipped manual - is docs/*.md missing from package.json "files"? ${JSON.stringify(manualEnvelope)}`);
    }

    console.log('Smoke test passed: the packed tarball serves and parses vibrary files when installed with --omit=dev.');
} catch (error) {
    console.error(`smoke-test-package: ${error.message}`);
    process.exitCode = 1;
} finally {
    if (child !== null && child.exitCode === null) {
        child.kill('SIGTERM');
        // Give the server's graceful-shutdown path a moment; it re-raises and exits on its own.
        await Promise.race([new Promise(function (resolve) { child.once('close', resolve); }), delay(5000)]);
    }
    rmSync(scratchRoot, { recursive: true, force: true });
}
