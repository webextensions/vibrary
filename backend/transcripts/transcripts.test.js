import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import { startAppAsync } from '../shared/testHelpers.js';
import { saveTranscriptAsync } from '../shared/transcriptStore.js';

// Route contract for the transcript history browser: list newest-first, read/delete by strict name, clear-all.

const cwd = mkdtempSync(path.join(tmpdir(), 'vibrary-transcripts-route-'));
const { server, requestJsonAsync, sendJsonAsync } = await startAppAsync(cwd);

after(function () {
    server.close();
    rmSync(cwd, { recursive: true, force: true });
});

const record = function (startedAt, outcome) {
    return { route: '/api/run-task', startedAt, endedAt: startedAt, outcome, error: null, truncated: false, lines: ['{"type":"user_prompt","text":"remembered"}'] };
};

test('the history lists newest first, serves one record, and deletes by name', async function () {
    await saveTranscriptAsync(cwd, record('2026-05-01T10:00:00.000Z', 'success'));
    await saveTranscriptAsync(cwd, record('2026-05-02T10:00:00.000Z', 'error'));

    const listed = await requestJsonAsync('/transcripts');
    assert.equal(listed.status, 200);
    assert.deepEqual(listed.body.output.transcripts.map(function (entry) { return entry.outcome; }), ['error', 'success']);

    const { name } = listed.body.output.transcripts[1];
    const single = await requestJsonAsync(`/transcripts/${name}`);
    assert.equal(single.body.output.transcript.lines.length, 1);

    // A shape-valid but absent name 404s; path-shaped names are rejected at the store layer (see its unit tests) and
    // a literal "../" in the URL never even reaches this router (the HTTP layer resolves it away).
    assert.equal((await requestJsonAsync('/transcripts/2020-01-01T00-00-00-000Z-success-gone-aaaaaaaa.json', { method: 'DELETE' })).status, 404);
    const removed = await requestJsonAsync(`/transcripts/${name}`, { method: 'DELETE' });
    assert.equal(removed.status, 200);
    assert.equal((await requestJsonAsync(`/transcripts/${name}`)).status, 404);
});

test('clear-all empties the history', async function () {
    const cleared = await sendJsonAsync('/transcripts', {}, 'DELETE');
    assert.equal(cleared.status, 200);
    assert.deepEqual((await requestJsonAsync('/transcripts')).body.output.transcripts, []);
});
