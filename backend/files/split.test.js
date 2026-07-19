import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import { startAppAsync } from '../shared/testHelpers.js';

// Route coverage for POST /split-spec: validation, the happy path through a fake `claude` answering JSON parts, and
// an unparseable answer surfacing as the 500 envelope with the parser's message.

const FAKE_CLAUDE = String.raw`#!/bin/sh
case "$2" in
    *GARBAGE*) printf 'I refuse to answer with JSON.\n' ;;
    *) printf 'Sure:\n[{"title":"part-one","content":"Do the first half."},{"title":"part-two","content":"Do the second half.","notes":"after part-one"}]\n' ;;
esac
`;

const fixtureDirectory = mkdtempSync(path.join(tmpdir(), 'vibrary-fake-claude-split-'));
writeFileSync(path.join(fixtureDirectory, 'claude'), FAKE_CLAUDE);
chmodSync(path.join(fixtureDirectory, 'claude'), 0o755);
const originalPath = process.env.PATH;
process.env.PATH = `${fixtureDirectory}${path.delimiter}${originalPath}`;

const cwd = mkdtempSync(path.join(tmpdir(), 'vibrary-split-route-'));
const { server, sendJsonAsync } = await startAppAsync(cwd);

after(function () {
    server.close();
    process.env.PATH = originalPath;
    rmSync(fixtureDirectory, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
});

test('split-spec validates its body', async function () {
    assert.equal((await sendJsonAsync('/split-spec', { title: 'x', content: '' })).status, 400);
    assert.equal((await sendJsonAsync('/split-spec', { content: 'y' })).status, 400);
});

test('a clean split answers the validated parts', async function () {
    const { status, body } = await sendJsonAsync('/split-spec', { title: 'huge', content: 'Everything at once.' });
    assert.equal(status, 200);
    assert.deepEqual(body.output.parts, [
        { title: 'part-one', content: 'Do the first half.', notes: '' },
        { title: 'part-two', content: 'Do the second half.', notes: 'after part-one' }
    ]);
});

test('an unparseable answer surfaces the parser message as a 500', async function () {
    const { status, body } = await sendJsonAsync('/split-spec', { title: 'huge', content: 'GARBAGE trigger' });
    assert.equal(status, 500);
    assert.match(body.errorMessage, /did not answer with a JSON array/);
});
