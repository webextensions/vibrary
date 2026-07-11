import assert from 'node:assert/strict';
import test from 'node:test';

import { moveEntry } from './moveEntry.ts';

test('moveEntry swaps with the neighbor in the given direction', function () {
    assert.deepEqual(moveEntry(['a', 'b', 'c'], 1, -1), ['b', 'a', 'c']);
    assert.deepEqual(moveEntry(['a', 'b', 'c'], 1, 1), ['a', 'c', 'b']);
});

test('moveEntry returns the SAME array (identity) at the ends or out of range', function () {
    const items = ['a', 'b', 'c'];
    assert.equal(moveEntry(items, 0, -1), items, 'up from the first is a no-op');
    assert.equal(moveEntry(items, 2, 1), items, 'down from the last is a no-op');
    assert.equal(moveEntry(items, 5, -1), items, 'out-of-range index is a no-op');
});
