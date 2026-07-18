import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import { startAppAsync } from '../shared/testHelpers.js';
import { BASE_RATING, K_FACTOR } from './eloRankings.js';
import { RANKINGS_FILE_NAME } from './rankingsStore.js';

// Route-level contract of the rankings API: scoped standings replayed from the match log, an always-complete
// annotated history, manual results, and one/many/all discard - each answer carrying the recomputed picture.

const entryXml = function (title, type) {
    return `<entry type="${type}"><title>${title}</title><content>the ${title} body</content></entry>`;
};

const cwd = mkdtempSync(path.join(tmpdir(), 'vibrary-rankings-route-'));
writeFileSync(path.join(cwd, '.vibraryinclude'), '*.xml\n');
writeFileSync(path.join(cwd, 'ideas.xml'), `<root><entries>${entryXml('idea-a', 'idea')}${entryXml('idea-b', 'idea')}${entryXml('idea-c', 'idea')}${entryXml('spec-d', 'spec')}</entries></root>`);

const { server, requestJsonAsync, sendJsonAsync } = await startAppAsync(cwd);

after(function () {
    server.close();
    rmSync(cwd, { recursive: true, force: true });
});

const titlesOf = function (standings) {
    return standings.map(function (row) { return row.title; });
};

test('GET seeds the idea-typed titles at the base rating with an empty log', async function () {
    const { status, body } = await requestJsonAsync('/rankings');
    assert.equal(status, 200);
    assert.deepEqual(titlesOf(body.output.standings), ['idea-a', 'idea-b', 'idea-c']);
    assert.ok(body.output.standings.every(function (row) { return row.rating === BASE_RATING && row.games === 0; }));
    assert.deepEqual(body.output.matches, []);
    assert.ok(body.output.suggestedPairings.length > 0);
});

test('GET can widen the scope to other entry types and rejects unknown ones', async function () {
    const widened = await requestJsonAsync('/rankings?types=idea,spec');
    assert.deepEqual(titlesOf(widened.body.output.standings), ['idea-a', 'idea-b', 'idea-c', 'spec-d']);
    const rejected = await requestJsonAsync('/rankings?types=idea,epic');
    assert.equal(rejected.status, 400);
});

test('a manual result moves ratings and answers with the recomputed standings', async function () {
    const { status, body } = await sendJsonAsync('/rankings/matches', { firstTitle: 'idea-a', secondTitle: 'idea-b', winnerTitle: 'idea-a', rationale: 'clearer payoff' });
    assert.equal(status, 200);
    assert.equal(body.output.match.judge, 'Human');
    const byTitle = new Map(body.output.standings.map(function (row) { return [row.title, row]; }));
    assert.equal(byTitle.get('idea-a').rating, BASE_RATING + (K_FACTOR / 2));
    assert.equal(byTitle.get('idea-b').rating, BASE_RATING - (K_FACTOR / 2));
    assert.equal(byTitle.get('idea-c').games, 0);
});

test('a manual result must name two existing entries and a winner among them', async function () {
    const unknown = await sendJsonAsync('/rankings/matches', { firstTitle: 'idea-a', secondTitle: 'no-such-idea', winnerTitle: 'idea-a' });
    assert.equal(unknown.status, 400);
    assert.match(unknown.body.errorMessage, /No entry is titled "no-such-idea"/);
    const badWinner = await sendJsonAsync('/rankings/matches', { firstTitle: 'idea-a', secondTitle: 'idea-b', winnerTitle: 'idea-c' });
    assert.equal(badWinner.status, 400);
    assert.match(badWinner.body.errorMessage, /winner that is neither contender/);
});

test('a match whose entry disappears goes orphaned: kept and flagged, but out of the replay', async function () {
    // idea-c loses to idea-a, then idea-c is removed from the file: the record must survive, carry the orphan flag,
    // and stop influencing the standings - repairing the title would bring its history straight back.
    await sendJsonAsync('/rankings/matches', { firstTitle: 'idea-a', secondTitle: 'idea-c', winnerTitle: 'idea-a' });
    writeFileSync(path.join(cwd, 'ideas.xml'), `<root><entries>${entryXml('idea-a', 'idea')}${entryXml('idea-b', 'idea')}${entryXml('spec-d', 'spec')}</entries></root>`);
    const { body } = await requestJsonAsync('/rankings');
    const orphan = body.output.matches.find(function (match) { return match.secondTitle === 'idea-c'; });
    assert.deepEqual(orphan.orphanedTitles, ['idea-c']);
    // Only the surviving idea-a vs idea-b match replays, so idea-a holds exactly one win's rating.
    const first = body.output.standings.find(function (row) { return row.title === 'idea-a'; });
    assert.deepEqual({ rating: first.rating, games: first.games }, { rating: BASE_RATING + (K_FACTOR / 2), games: 1 });
});

test('discarding by id recomputes, and discarding everything resets the board', async function () {
    const { body: before } = await requestJsonAsync('/rankings');
    const ids = before.output.matches.map(function (match) { return match.id; });
    assert.equal(ids.length, 2);
    const partial = await sendJsonAsync('/rankings/matches', { ids: [ids[0]] }, 'DELETE');
    assert.equal(partial.body.output.removed, 1);
    const everything = await sendJsonAsync('/rankings/matches', { ids: partial.body.output.matches.map(function (match) { return match.id; }) }, 'DELETE');
    assert.equal(everything.body.output.matches.length, 0);
    assert.ok(everything.body.output.standings.every(function (row) { return row.rating === BASE_RATING && row.games === 0; }));
    const malformed = await sendJsonAsync('/rankings/matches', { ids: 'everything' }, 'DELETE');
    assert.equal(malformed.status, 400);
});

test('a broken rankings file answers 409 with the message naming the file', async function () {
    writeFileSync(path.join(cwd, RANKINGS_FILE_NAME), '{ broken');
    const { status, body } = await requestJsonAsync('/rankings');
    assert.equal(status, 409);
    assert.match(body.errorMessage, new RegExp(`${RANKINGS_FILE_NAME} is not valid JSON`));
    rmSync(path.join(cwd, RANKINGS_FILE_NAME));
});
