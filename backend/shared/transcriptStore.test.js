import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import { MAX_TRANSCRIPTS, saveTranscriptAsync, TRANSCRIPTS_RELATIVE_PATH } from './transcriptStore.js';

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
