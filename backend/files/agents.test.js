import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

import { startAppAsync } from '../shared/testHelpers.js';

// Integration coverage for the streaming agent routes (streamClaudeRoute): the NDJSON contract every run/apply/
// generate action consumes - the echoed user_prompt line, the CLI's own stream-json lines passed through verbatim,
// and the terminal {"type":"_exit"} line carrying the process outcome for both a clean and a failed run. A fake
// `claude` on PATH (the spawnClaude.test.js technique) drives the real spawn/stream plumbing end to end.

const FAKE_CLAUDE = String.raw`#!/bin/sh
case "$2" in
    *FAIL*) echo "agent exploded" >&2; exit 3 ;;
    *SLEEP*)
        sleep 1
        printf '{"type":"result","result":"slow done"}\n'
        ;;
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
    const lines = await streamLinesAsync('/apply-batch', { entries: [{ title: 'demo', content: 'do the thing' }] });
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

test('a second run while one is active is refused with a 409, and the slot frees afterwards', async function () {
    const first = streamLinesAsync('/apply-batch', { entries: [{ title: 'demo', content: 'please SLEEP a while' }] });
    await delay(200); // let the first request claim the run slot and spawn

    // Any streaming agent route contends for the same slot; validation failures never claim it.
    const rejected = await sendJsonAsync('/run-task', { title: 'demo', content: 'do the thing' });
    assert.equal(rejected.status, 409);
    assert.match(rejected.body.errorMessage ?? '', /already in progress/);

    assert.deepEqual((await first).at(-1), { type: '_exit', code: 0, error: null });

    // The slot is released once the run ended, so the next run streams normally.
    const second = await streamLinesAsync('/run-task', { title: 'demo', content: 'do the thing' });
    assert.deepEqual(second.at(-1), { type: '_exit', code: 0, error: null });
});

test('content that would overflow the single argv argument is refused with a 413', async function () {
    // Comfortably over the 96 KiB prompt budget, but well under the 10 MB body limit, so it reaches the guard.
    const huge = 'x'.repeat(200 * 1024);

    const applied = await sendJsonAsync('/apply-batch', { entries: [{ title: 'demo', content: huge }] });
    assert.equal(applied.status, 413);
    assert.match(applied.body.errorMessage ?? '', /too large/);

    // The batch limit applies to the entries' COMBINED text, not each one: several under-limit entries still overflow.
    const entries = [1, 2, 3].map(function () {
        return { title: 'demo', content: 'y'.repeat(40 * 1024) };
    });
    const batched = await sendJsonAsync('/apply-batch', { entries });
    assert.equal(batched.status, 413);
});

test('validation failures answer the plain JSON envelope, not a stream', async function () {
    const { status, body } = await sendJsonAsync('/apply-batch', { entries: [{ title: 'demo', content: '' }] });
    assert.equal(status, 400);
    assert.equal(body.status, 'error');

    const chat = await sendJsonAsync('/chat', { message: 'hi', sessionId: 'not-a-uuid' });
    assert.equal(chat.status, 400);
    assert.match(chat.body.errorMessage ?? '', /session UUID/);

    assert.equal((await requestJsonAsync('/nope')).status, 404);
});
