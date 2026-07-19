import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import { clearTranscriptsAsync, deleteTranscriptAsync, listTranscriptsAsync, MAX_TRANSCRIPTS, readTranscriptAsync, saveTranscriptAsync, TRANSCRIPTS_RELATIVE_PATH } from './transcriptStore.js';

// The persistence contract: records land as chronologically-named JSON under .vibrary/transcripts/, the cap prunes
// oldest-first, and a failure never throws (best-effort by design).

const cwd = mkdtempSync(path.join(tmpdir(), 'vibrary-transcripts-'));
const directory = path.join(cwd, TRANSCRIPTS_RELATIVE_PATH);

after(function () {
    rmSync(cwd, { recursive: true, force: true });
});

const record = function (startedAt) {
    return { route: '/api/run-task', startedAt, endedAt: startedAt, outcome: 'success', error: null, truncated: false, lines: ['{"type":"user_prompt","text":"hi"}'] };
};

test('a save creates the directory on demand and round-trips the record', async function () {
    await saveTranscriptAsync(cwd, record('2026-01-01T10:00:00.000Z'));
    const names = readdirSync(directory);
    assert.equal(names.length, 1);
    assert.match(names[0], /^2026-01-01T10-00-00-000Z-/);
    const stored = JSON.parse(readFileSync(path.join(directory, names[0]), 'utf8'));
    assert.equal(stored.outcome, 'success');
    assert.deepEqual(stored.lines, ['{"type":"user_prompt","text":"hi"}']);
});

test('the cap prunes oldest-first by the chronological file names', async function () {
    // Backfill to the cap with older-dated names, then save one more: the single oldest must go.
    mkdirSync(directory, { recursive: true });
    for (let index = 0; index < MAX_TRANSCRIPTS; index += 1) {
        writeFileSync(path.join(directory, `2025-01-01T00-00-${String(index).padStart(2, '0')}-000Z-${String(index).padStart(4, '0')}.json`), '{}');
    }
    await saveTranscriptAsync(cwd, record('2026-02-02T10:00:00.000Z'));
    const names = readdirSync(directory).toSorted(function (a, b) { return a.localeCompare(b); });
    assert.equal(names.length, MAX_TRANSCRIPTS);
    // The very oldest backfilled name is gone; the newest save survives at the end of the sort.
    assert.ok(!names[0].startsWith('2025-01-01T00-00-00-000Z-0000'));
    assert.match(names.at(-1) ?? '', /^2026-02-02T10-00-00-000Z-/);
});

test('the listing decodes purely from names, newest first, skipping foreign files', async function () {
    const listCwd = mkdtempSync(path.join(tmpdir(), 'vibrary-transcripts-list-'));
    try {
        await saveTranscriptAsync(listCwd, record('2026-03-01T10:00:00.000Z'));
        await saveTranscriptAsync(listCwd, { ...record('2026-03-02T10:00:00.000Z'), outcome: 'error', route: '/api/plan-spec' });
        writeFileSync(path.join(listCwd, TRANSCRIPTS_RELATIVE_PATH, 'not-a-transcript.json'), '{}');
        const listed = await listTranscriptsAsync(listCwd);
        assert.equal(listed.length, 2);
        assert.deepEqual(
            listed.map(function (entry) { return { startedAt: entry.startedAt, outcome: entry.outcome, route: entry.route }; }),
            [
                { startedAt: '2026-03-02T10:00:00.000Z', outcome: 'error', route: 'plan-spec' },
                { startedAt: '2026-03-01T10:00:00.000Z', outcome: 'success', route: 'run-task' }
            ]
        );
        const emptyCwd = mkdtempSync(path.join(tmpdir(), 'vibrary-transcripts-empty-'));
        assert.deepEqual(await listTranscriptsAsync(emptyCwd), []);
    } finally {
        rmSync(listCwd, { recursive: true, force: true });
    }
});

test('read and delete gate on the strict name shape, and clear removes everything', async function () {
    const rwCwd = mkdtempSync(path.join(tmpdir(), 'vibrary-transcripts-rw-'));
    try {
        await saveTranscriptAsync(rwCwd, record('2026-04-01T10:00:00.000Z'));
        const [entry] = await listTranscriptsAsync(rwCwd);
        const stored = await readTranscriptAsync(rwCwd, entry.name);
        assert.equal(stored.outcome, 'success');
        // Path-shaped or foreign names never reach the filesystem.
        assert.equal(await readTranscriptAsync(rwCwd, '../settings.local.json'), null);
        assert.equal(await deleteTranscriptAsync(rwCwd, '../../etc/passwd'), false);
        assert.equal(await deleteTranscriptAsync(rwCwd, entry.name), true);
        assert.deepEqual(await listTranscriptsAsync(rwCwd), []);
        await saveTranscriptAsync(rwCwd, record('2026-04-02T10:00:00.000Z'));
        await clearTranscriptsAsync(rwCwd);
        assert.deepEqual(await listTranscriptsAsync(rwCwd), []);
    } finally {
        rmSync(rwCwd, { recursive: true, force: true });
    }
});
