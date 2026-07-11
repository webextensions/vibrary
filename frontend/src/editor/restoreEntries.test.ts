import assert from 'node:assert/strict';
import { test } from 'node:test';

import { restoreEntries } from './restoreEntries.ts';
import { emptySpec } from '../xml/vibraryXml.ts';

const specOf = function (id: string, content: string) {
    return { ...emptySpec(), id, title: id, content };
};

test('restores entries that are still present and untouched since the op', function () {
    const before = specOf('a', 'the cat sat');
    const after = specOf('a', 'the dog sat'); // the object the op produced, still in the list
    const untouched = specOf('b', 'unrelated');
    const restored = restoreEntries([after, untouched], [{ before, after }]);
    assert.equal(restored[0], before); // reverted to the pre-op spec
    assert.equal(restored[1], untouched); // an entry the op never changed is left as-is
});

test('does not clobber an entry edited since the op (identity differs)', function () {
    const before = specOf('a', 'the cat sat');
    const after = specOf('a', 'the dog sat');
    const editedSince = { ...after, content: 'the dog ran away' }; // new object from a later edit
    const restored = restoreEntries([editedSince], [{ before, after }]);
    assert.equal(restored[0], editedSince); // the user's newer edit survives
});

test('skips an entry deleted since the op', function () {
    const before = specOf('a', 'the cat sat');
    const after = specOf('a', 'the dog sat');
    const other = specOf('b', 'other');
    const restored = restoreEntries([other], [{ before, after }]); // a is gone
    assert.deepEqual(restored.map(function (spec) { return spec.id; }), ['b']);
});

test('an empty change set leaves every entry as-is', function () {
    const current = [specOf('a', 'x')];
    assert.equal(restoreEntries(current, [])[0], current[0]);
});
