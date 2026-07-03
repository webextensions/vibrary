import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import { startAppAsync } from './testHelpers.js';

// Integration coverage for the streaming agent routes (streamClaudeRoute): the NDJSON contract every run/apply/
// generate action consumes - the echoed user_prompt line, the CLI's own stream-json lines passed through verbatim,
// and the terminal {"type":"_exit"} line carrying the process outcome for both a clean and a failed run. A fake
// `claude` on PATH (the spawnClaude.test.js technique) drives the real spawn/stream plumbing end to end.

const FAKE_CLAUDE = String.raw`#!/bin/sh
case "$2" in
    *FAIL*) echo "agent exploded" >&2; exit 3 ;;
    *)
        printf '{"type":"system","subtype":"init","session_id":"11111111-2222-3333-4444-555555555555"}\n'
        printf '{"type":"result","result":"all done"}\n'
        ;;
esac
`;

// Module-scope setup (this whole file is the suite): the fake CLI on PATH, and an app over a scratch folder.
const fixtureDirectory = mkdtempSync(path.join(tmpdir(), 'vibrary-fake-claude-route-'));
writeFileSync(path.join(fixtureDirectory, 'claude'), FAKE_CLAUDE);
chmodSync(path.join(fixtureDirectory, 'claude'), 0o755);
const originalPath = process.env.PATH;
process.env.PATH = `${fixtureDirectory}${path.delimiter}${originalPath}`;

const cwd = mkdtempSync(path.join(tmpdir(), 'vibrary-stream-route-'));
const { server, requestJsonAsync, sendJsonAsync } = await startAppAsync(cwd);

after(function () {
    server.close();
    process.env.PATH = originalPath;
    rmSync(fixtureDirectory, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
});

// POST a streaming route and split its NDJSON body into parsed lines.
const streamLinesAsync = async function (route, payload) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${route}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /application\/x-ndjson/);
    const text = await response.text();
    return text.trim().split('\n').map(function (line) {
        return /** @type {any} */ (JSON.parse(line));
    });
};

test('a clean run streams the prompt echo, the CLI lines, and a code-0 _exit terminator', async function () {
    const lines = await streamLinesAsync('/apply', { title: 'demo', content: 'do the thing' });
    assert.equal(lines[0].type, 'user_prompt');
    assert.match(lines[0].text, /do the thing/);
    assert.equal(lines[1].session_id, '11111111-2222-3333-4444-555555555555');
    assert.deepEqual(lines.at(-2), { type: 'result', result: 'all done' });
    assert.deepEqual(lines.at(-1), { type: '_exit', code: 0, error: null });
});

test('a failing run terminates the stream with a code-1 _exit carrying the stderr text', async function () {
    const lines = await streamLinesAsync('/run-task', { title: 'demo', content: 'please FAIL' });
    assert.deepEqual(lines.at(-1), { type: '_exit', code: 1, error: 'agent exploded' });
});

test('validation failures answer the plain JSON envelope, not a stream', async function () {
    const { status, body } = await sendJsonAsync('/apply', { title: 'demo', content: '' });
    assert.equal(status, 400);
    assert.equal(body.status, 'error');

    const chat = await sendJsonAsync('/chat', { message: 'hi', sessionId: 'not-a-uuid' });
    assert.equal(chat.status, 400);
    assert.match(chat.body.errorMessage ?? '', /session UUID/);

    assert.equal((await requestJsonAsync('/nope')).status, 404);
});
