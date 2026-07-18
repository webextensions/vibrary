import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import { startAppAsync } from '../shared/testHelpers.js';

// Route coverage for POST /title (the editor's Populate button): validation, the slugify contract (first non-empty
// stdout line through normalizeTitle - the model is told to answer with a bare title, but a chatty response must
// still land as a clean slug), and a CLI failure surfacing as the 500 envelope. A fake `claude` on PATH (the
// spawnClaude.test.js technique) keys its behavior off the prompt, which embeds the request's content.

const FAKE_CLAUDE = String.raw`#!/bin/sh
case "$2" in
    *FAIL*) echo "title model exploded" >&2; exit 3 ;;
    *) printf 'Here you go:\n\nMy Great Title!\n' ;;
esac
`;

const fixtureDirectory = mkdtempSync(path.join(tmpdir(), 'vibrary-fake-claude-title-'));
writeFileSync(path.join(fixtureDirectory, 'claude'), FAKE_CLAUDE);
chmodSync(path.join(fixtureDirectory, 'claude'), 0o755);
const originalPath = process.env.PATH;
process.env.PATH = `${fixtureDirectory}${path.delimiter}${originalPath}`;

const cwd = mkdtempSync(path.join(tmpdir(), 'vibrary-title-route-'));
const { server, sendJsonAsync } = await startAppAsync(cwd);

after(function () {
    server.close();
    process.env.PATH = originalPath;
    rmSync(fixtureDirectory, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
});

test('slugifies the first non-empty stdout line through normalizeTitle', async function () {
    const { status, body } = await sendJsonAsync('/title', { content: 'Some spec content' });
    assert.equal(status, 200);
    // The fake answers with prose before the title; the first non-empty line normalized is what lands.
    assert.equal(body.output.title, 'here-you-go');
});

test('rejects empty or whitespace-only content with a 400', async function () {
    assert.equal((await sendJsonAsync('/title', { content: '' })).status, 400);
    assert.equal((await sendJsonAsync('/title', { content: ' '.repeat(3) })).status, 400);
    assert.equal((await sendJsonAsync('/title', {})).status, 400);
});

test('a CLI failure surfaces as the 500 envelope carrying the stderr message', async function () {
    const { status, body } = await sendJsonAsync('/title', { content: 'please FAIL now' });
    assert.equal(status, 500);
    assert.equal(body.status, 'error');
    assert.match(body.errorMessage ?? '', /title model exploded/);
});
