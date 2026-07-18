import assert from 'node:assert/strict';
import test from 'node:test';

import { splitByMatches } from './splitByMatches.ts';

// splitByMatches is the matching half of highlightText (the Search panel's snippet emphasis and the editor's
// jumped-to-entry marking); pin its guard and edges here since the JSX half cannot run under node --test.

test('an empty needle returns the whole text unmatched (the infinite-indexOf guard)', function () {
    assert.deepEqual(splitByMatches('anything', ''), [{ text: 'anything', isMatch: false }]);
});

test('matches case-insensitively while preserving the original casing', function () {
    assert.deepEqual(splitByMatches('Alpha and ALPHA', 'alpha'), [
        { text: 'Alpha', isMatch: true },
        { text: ' and ', isMatch: false },
        { text: 'ALPHA', isMatch: true }
    ]);
});

test('handles matches at the start, the end, and adjacent to each other', function () {
    assert.deepEqual(splitByMatches('aa-b-aa', 'aa'), [
        { text: 'aa', isMatch: true },
        { text: '-b-', isMatch: false },
        { text: 'aa', isMatch: true }
    ]);
    assert.deepEqual(splitByMatches('abab', 'ab'), [
        { text: 'ab', isMatch: true },
        { text: 'ab', isMatch: true }
    ]);
});

test('no match returns one plain segment', function () {
    assert.deepEqual(splitByMatches('nothing here', 'zzz'), [{ text: 'nothing here', isMatch: false }]);
});
