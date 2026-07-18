import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BASE_RATING, expectedScore, K_FACTOR, replayMatches, selectLeastMetPairings } from './eloRankings.js';

// The rankings feature's core invariant: standings are a pure replay of the kept matches, so discarding records and
// recomputing is exact. These tests pin the replay's ordering, seeding, and tolerance rules alongside the Elo math.

const match = function (firstTitle, secondTitle, winnerTitle, playedAt) {
    return { firstTitle, secondTitle, winnerTitle, playedAt };
};

test('expectedScore is 0.5 between equals and favors the higher rating symmetrically', function () {
    assert.equal(expectedScore(1500, 1500), 0.5);
    const favorite = expectedScore(1700, 1500);
    assert.ok(favorite > 0.5);
    // The two sides of one match must add to 1: what the favorite expects to win, the underdog expects to lose.
    assert.ok(Math.abs((favorite + expectedScore(1500, 1700)) - 1) < 1e-12);
});

test('a first match between equals exchanges exactly half the K-factor', function () {
    const standings = replayMatches([match('a', 'b', 'a', '2026-01-01T00:00:00.000Z')]);
    assert.deepEqual(standings, [
        { title: 'a', rating: BASE_RATING + (K_FACTOR / 2), wins: 1, losses: 0, games: 1 },
        { title: 'b', rating: BASE_RATING - (K_FACTOR / 2), wins: 0, losses: 1, games: 1 }
    ]);
});

test('an upset moves more points than an expected win', function () {
    // Build a favorite by letting a beat b twice, then let b win the third match (the upset).
    const buildUp = [
        match('a', 'b', 'a', '2026-01-01T00:00:00.000Z'),
        match('a', 'b', 'a', '2026-01-02T00:00:00.000Z')
    ];
    const before = replayMatches(buildUp);
    const after = replayMatches([...buildUp, match('a', 'b', 'b', '2026-01-03T00:00:00.000Z')]);
    const ratingOf = function (standings, title) {
        return standings.find(function (row) { return row.title === title; }).rating;
    };
    const upsetGain = ratingOf(after, 'b') - ratingOf(before, 'b');
    assert.ok(upsetGain > K_FACTOR / 2, `upset gained ${upsetGain}, expected more than ${K_FACTOR / 2}`);
});

test('replays in playedAt order regardless of stored order', function () {
    // Same records, shuffled storage: the replay must sort by timestamp, so both orders yield identical standings.
    const chronological = [
        match('a', 'b', 'a', '2026-01-01T00:00:00.000Z'),
        match('b', 'c', 'b', '2026-01-02T00:00:00.000Z'),
        match('a', 'c', 'c', '2026-01-03T00:00:00.000Z')
    ];
    const shuffled = [chronological[2], chronological[0], chronological[1]];
    assert.deepEqual(replayMatches(shuffled), replayMatches(chronological));
});

test('seeds every provided title at the base rating even with no matches', function () {
    const standings = replayMatches([], ['quiet-idea', 'another-idea']);
    assert.deepEqual(standings, [
        { title: 'another-idea', rating: BASE_RATING, wins: 0, losses: 0, games: 0 },
        { title: 'quiet-idea', rating: BASE_RATING, wins: 0, losses: 0, games: 0 }
    ]);
});

test('skips a record whose winner is neither contender instead of crashing the replay', function () {
    const standings = replayMatches([
        match('a', 'b', 'someone-else', '2026-01-01T00:00:00.000Z'),
        match('a', 'b', 'a', '2026-01-02T00:00:00.000Z')
    ]);
    const a = standings.find(function (row) { return row.title === 'a'; });
    assert.deepEqual({ wins: a.wins, games: a.games }, { wins: 1, games: 1 });
});

test('sorts standings by rating with the title as a deterministic tie-break', function () {
    const standings = replayMatches([], ['b-idea', 'a-idea']);
    assert.deepEqual(standings.map(function (row) { return row.title; }), ['a-idea', 'b-idea']);
});

test('pairing prefers the pair that has met the fewest times', function () {
    const played = [match('a', 'b', 'a', '2026-01-01T00:00:00.000Z')];
    // With a-b already played once, both never-met pairs tie at zero; random 0 picks the first in traversal order.
    const pairings = selectLeastMetPairings(['a', 'b', 'c'], played, 1, function () { return 0; });
    assert.deepEqual(pairings, [['a', 'c']]);
});

test('a batch spreads across all pairs before rematching any of them', function () {
    const pairings = selectLeastMetPairings(['a', 'b', 'c'], [], 4, function () { return 0; });
    const keys = pairings.map(function (pair) { return pair.join(' '); });
    // Three distinct pairs exist; the fourth pick must wrap around to a rematch, not starve.
    assert.deepEqual(new Set(keys.slice(0, 3)).size, 3);
    assert.equal(keys.length, 4);
});

test('pairing returns nothing without at least two titles', function () {
    assert.deepEqual(selectLeastMetPairings(['only-one'], [], 3), []);
    assert.deepEqual(selectLeastMetPairings([], [], 3), []);
});
