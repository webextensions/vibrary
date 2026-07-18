import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import { addMatchesAsync, createMatch, describeMatchProblem, RANKINGS_FILE_NAME, readRankingsAsync, removeMatchesAsync } from './rankingsStore.js';

// The match log is the rankings feature's only persistent state and is user-editable JSON, so the store's contract is
// strict: a missing file is a normal empty log, but any half-broken content must surface as one precise error rather
// than a silent partial read that the next write would then make permanent.

const makeFolder = function () {
    return mkdtempSync(path.join(tmpdir(), 'vibrary-rankings-store-'));
};

const validMatch = function (overrides = {}) {
    return {
        id: 'match-1',
        playedAt: '2026-01-01T00:00:00.000Z',
        firstTitle: 'idea-a',
        secondTitle: 'idea-b',
        winnerTitle: 'idea-a',
        judge: 'Human',
        rationale: '',
        ...overrides
    };
};

const folders = [];
after(function () {
    for (const folder of folders) {
        rmSync(folder, { recursive: true, force: true });
    }
});

test('a missing file reads as an empty match log', async function () {
    const cwd = makeFolder();
    folders.push(cwd);
    assert.deepEqual(await readRankingsAsync(cwd), { matches: [] });
});

test('a corrupted file surfaces one clear error naming the file', async function () {
    const cwd = makeFolder();
    folders.push(cwd);
    writeFileSync(path.join(cwd, RANKINGS_FILE_NAME), '{ not json');
    await assert.rejects(readRankingsAsync(cwd), new RegExp(`${RANKINGS_FILE_NAME} is not valid JSON`));
});

test('a wrong top-level shape and an invalid record are both rejected with their position', async function () {
    const cwd = makeFolder();
    folders.push(cwd);
    writeFileSync(path.join(cwd, RANKINGS_FILE_NAME), JSON.stringify([]));
    await assert.rejects(readRankingsAsync(cwd), /must be an object with a "matches" array/);
    const records = [validMatch(), validMatch({ id: 'match-2', winnerTitle: 'someone-else' })];
    writeFileSync(path.join(cwd, RANKINGS_FILE_NAME), JSON.stringify({ matches: records }));
    await assert.rejects(readRankingsAsync(cwd), /match 2 names a winner that is neither contender/);
});

test('describeMatchProblem pins each validation rule', function () {
    assert.equal(describeMatchProblem(validMatch()), null);
    assert.equal(describeMatchProblem('text'), 'is not an object');
    assert.equal(describeMatchProblem(validMatch({ id: '' })), 'is missing an id');
    assert.equal(describeMatchProblem(validMatch({ playedAt: 'yesterday-ish' })), 'has no parseable playedAt timestamp');
    assert.equal(describeMatchProblem(validMatch({ secondTitle: '' })), 'needs firstTitle and secondTitle');
    assert.equal(describeMatchProblem(validMatch({ secondTitle: 'idea-a', winnerTitle: 'idea-a' })), 'pits an entry against itself');
    assert.equal(describeMatchProblem(validMatch({ judge: 'jury' })), 'needs a judge of AI or Human');
    assert.equal(describeMatchProblem(validMatch({ rationale: 42 })), 'has a non-text rationale');
});

test('createMatch stamps an id and timestamp onto the caller\'s fields', function () {
    const record = createMatch({ firstTitle: 'idea-a', secondTitle: 'idea-b', winnerTitle: 'idea-b', judge: 'AI', rationale: 'clearer scope' });
    assert.equal(describeMatchProblem(record), null);
    assert.equal(record.judge, 'AI');
    assert.equal(record.rationale, 'clearer scope');
    assert.notEqual(record.id, createMatch({ firstTitle: 'idea-a', secondTitle: 'idea-b', winnerTitle: 'idea-b', judge: 'AI' }).id);
});

test('add appends across calls and the file round-trips through read', async function () {
    const cwd = makeFolder();
    folders.push(cwd);
    const first = createMatch({ firstTitle: 'idea-a', secondTitle: 'idea-b', winnerTitle: 'idea-a', judge: 'Human' });
    const second = createMatch({ firstTitle: 'idea-a', secondTitle: 'idea-c', winnerTitle: 'idea-c', judge: 'AI', rationale: 'more impact' });
    await addMatchesAsync(cwd, [first]);
    await addMatchesAsync(cwd, [second]);
    assert.deepEqual((await readRankingsAsync(cwd)).matches, [first, second]);
    // The file on disk stays human-editable: pretty-printed with a trailing newline, like the settings file.
    assert.ok(readFileSync(path.join(cwd, RANKINGS_FILE_NAME), 'utf8').endsWith('}\n'));
});

test('add validates before writing and leaves the log untouched on rejection', async function () {
    const cwd = makeFolder();
    folders.push(cwd);
    await addMatchesAsync(cwd, [validMatch()]);
    await assert.rejects(addMatchesAsync(cwd, [validMatch({ id: 'match-2', judge: 'jury' })]), /needs a judge of AI or Human/);
    assert.equal((await readRankingsAsync(cwd)).matches.length, 1);
});

test('remove discards one, many, or all by id and reports the true count', async function () {
    const cwd = makeFolder();
    folders.push(cwd);
    const records = ['a', 'b', 'c'].map(function (suffix) {
        return validMatch({ id: `match-${suffix}` });
    });
    await addMatchesAsync(cwd, records);
    const partial = await removeMatchesAsync(cwd, ['match-a', 'match-c', 'match-already-gone']);
    assert.equal(partial.removed, 2);
    assert.deepEqual(partial.matches.map(function (record) { return record.id; }), ['match-b']);
    const rest = await removeMatchesAsync(cwd, ['match-b']);
    assert.deepEqual(rest, { matches: [], removed: 1 });
});
