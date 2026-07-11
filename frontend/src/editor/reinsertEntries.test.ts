import assert from 'node:assert/strict';
import { test } from 'node:test';

import { reinsertEntries } from './reinsertEntries.ts';
import { emptySpec } from '../xml/vibraryXml.ts';

const specOf = function (id: string) {
    return { ...emptySpec(), id, title: id };
};

const idsOf = function (specs: ReturnType<typeof specOf>[]) {
    return specs.map(function (spec) { return spec.id; });
};

test('re-inserts removed entries at their original positions', function () {
    const specA = specOf('a');
    const specB = specOf('b');
    const specC = specOf('c');
    const specD = specOf('d');
    const specE = specOf('e');
    const current = [specA, specC, specE]; // b (index 1) and d (index 3) were deleted
    const removed = [{ index: 1, spec: specB }, { index: 3, spec: specD }];
    assert.deepEqual(idsOf(reinsertEntries(current, removed)), ['a', 'b', 'c', 'd', 'e']);
});

test('does not clobber an edit made to another entry between delete and undo', function () {
    const [a, b, c] = [specOf('a'), specOf('b'), specOf('c')];
    const editedC = { ...c, content: 'edited after the delete' };
    const current = [a, editedC]; // b deleted; c then edited
    const restored = reinsertEntries(current, [{ index: 1, spec: b }]);
    assert.deepEqual(idsOf(restored), ['a', 'b', 'c']);
    // c keeps the post-delete edit - only b is added back.
    assert.equal(restored[2].content, 'edited after the delete');
});

test('re-inserts alongside an entry the user added after the delete', function () {
    const [a, b, x] = [specOf('a'), specOf('b'), specOf('x')];
    const current = [a, x]; // b (index 1) deleted, then x appended
    assert.deepEqual(idsOf(reinsertEntries(current, [{ index: 1, spec: b }])), ['a', 'b', 'x']);
});

test('skips an entry whose id is already present (double undo does not duplicate)', function () {
    const [a, b] = [specOf('a'), specOf('b')];
    const already = [a, b]; // b already back
    assert.deepEqual(idsOf(reinsertEntries(already, [{ index: 1, spec: b }])), ['a', 'b']);
});

test('an index past the current end clamps to the end', function () {
    const [a, b] = [specOf('a'), specOf('b')];
    // b held index 5 in a since-shrunken list of just [a].
    assert.deepEqual(idsOf(reinsertEntries([a], [{ index: 5, spec: b }])), ['a', 'b']);
});
