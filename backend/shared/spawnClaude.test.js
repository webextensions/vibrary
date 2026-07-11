import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import { spawnClaudeAsync, terminateActiveClaudeRunsAsync } from './spawnClaude.js';

// Exercise the real process lifecycle - clean-exit resolve, stderr-carrying reject, timeout kill, abort, missing
// CLI - against a fake `claude` executable prepended to PATH. The fake keys its behavior off the prompt argument, so
// each test drives one path without any mocking of child_process itself.

const FAKE_CLAUDE = `#!/bin/sh
case "$2" in
    *SLEEP*) sleep 30 ;;
    *FAIL*) echo "boom from stderr" >&2; exit 3 ;;
    *) printf 'OK-OUTPUT' ;;
esac
`;

// Module-scope setup (this whole file is the suite): create the fake CLI and prepend it to PATH before any test runs.
const fixtureDirectory = mkdtempSync(path.join(tmpdir(), 'vibrary-fake-claude-'));
writeFileSync(path.join(fixtureDirectory, 'claude'), FAKE_CLAUDE);
chmodSync(path.join(fixtureDirectory, 'claude'), 0o755);
const originalPath = process.env.PATH;
process.env.PATH = `${fixtureDirectory}${path.delimiter}${originalPath}`;

after(function () {
    process.env.PATH = originalPath;
    rmSync(fixtureDirectory, { recursive: true, force: true });
});

const baseOptions = function (prompt) {
    return { cwd: process.cwd(), args: ['-p', prompt], timeoutMs: 5000, timeoutMessage: 'run timed out' };
};

test('resolves with the full stdout on a clean exit', async function () {
    assert.equal(await spawnClaudeAsync(baseOptions('hello')), 'OK-OUTPUT');
});

test('rejects with the trimmed stderr on a non-zero exit', async function () {
    await assert.rejects(spawnClaudeAsync(baseOptions('please FAIL')), { message: 'boom from stderr' });
});

test('rejects with the timeout message and kills a stalled run', async function () {
    const startedAt = Date.now();
    await assert.rejects(
        spawnClaudeAsync({ ...baseOptions('please SLEEP'), timeoutMs: 200 }),
        { message: 'run timed out' }
    );
    // The 30s sleeper must have been killed, not waited out; leave generous slack for slow CI.
    assert.ok(Date.now() - startedAt < 10000, 'stalled child was not killed within the timeout path');
});

test('rejects immediately when the signal is already aborted', async function () {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
        spawnClaudeAsync({ ...baseOptions('hello'), signal: controller.signal }),
        { message: 'Aborted by user' }
    );
});

test('rejects with the aborted message when aborted mid-run', async function () {
    const controller = new AbortController();
    const pending = assert.rejects(
        spawnClaudeAsync({ ...baseOptions('please SLEEP'), signal: controller.signal }),
        { message: 'Aborted by user' }
    );
    setTimeout(function () {
        controller.abort();
    }, 100);
    await pending;
});

test('terminateActiveClaudeRunsAsync kills every live run (the server shutdown path)', async function () {
    const startedAt = Date.now();
    // Two concurrent 30s sleepers stand in for in-flight agent runs; the registry is populated synchronously on spawn.
    const pendingRuns = [1, 2].map(function () {
        return assert.rejects(
            spawnClaudeAsync({ ...baseOptions('please SLEEP'), timeoutMs: 30000 }),
            { message: 'Claude exited with code null' }
        );
    });
    await terminateActiveClaudeRunsAsync();
    await Promise.all(pendingRuns);
    // Killed via the shutdown path, not waited out; leave generous slack for slow CI.
    assert.ok(Date.now() - startedAt < 10000, 'live runs were not killed by the shutdown path');
});

test('rejects with a clear message when the CLI is not on PATH', async function () {
    const savedPath = process.env.PATH;
    process.env.PATH = path.join(fixtureDirectory, 'no-such-directory'); // a PATH with no claude anywhere
    try {
        await assert.rejects(spawnClaudeAsync(baseOptions('hello')), { message: 'Claude CLI not found on PATH' });
    } finally {
        process.env.PATH = savedPath;
    }
});
