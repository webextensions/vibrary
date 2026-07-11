import assert from 'node:assert/strict';
import { test } from 'node:test';

import { danglingRelations } from './danglingRelations.ts';

test('returns only the references whose title is not among the known titles', function () {
    const known = new Set(['alpha', 'beta', 'gamma']);
    assert.deepEqual(danglingRelations(['alpha', 'ghost', 'gamma', 'phantom'], known), ['ghost', 'phantom']);
});

test('an all-resolving reference list is empty, an all-broken one is returned whole', function () {
    const known = new Set(['alpha', 'beta']);
    assert.deepEqual(danglingRelations(['alpha', 'beta'], known), []);
    assert.deepEqual(danglingRelations(['x', 'y'], known), ['x', 'y']);
});

test('matching is exact (case-sensitive), mirroring how relatesTo resolves by exact title', function () {
    assert.deepEqual(danglingRelations(['Alpha'], new Set(['alpha'])), ['Alpha']);
});
