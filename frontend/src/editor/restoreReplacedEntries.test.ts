import assert from 'node:assert/strict';
import { test } from 'node:test';

import { restoreReplacedEntries } from './restoreReplacedEntries.ts';
import { emptySpec } from '../xml/vibraryXml.ts';

const specOf = function (id: string, fields: { content?: string; notes?: string }) {
    return { ...emptySpec(), id, title: id, content: fields.content ?? '', notes: fields.notes ?? '' };
};

test('restores content and notes of entries left untouched since the replace', function () {
    const beforeA = specOf('a', { content: 'the cat sat', notes: 'a cat note' });
    const afterA = specOf('a', { content: 'the dog sat', notes: 'a dog note' });
    const current = [afterA, specOf('b', { content: 'unrelated' })];
    const restored = restoreReplacedEntries(current, [{ before: beforeA, afterContent: 'the dog sat', afterNotes: 'a dog note' }]);
    assert.equal(restored[0], beforeA); // the whole pre-replace spec is put back
    assert.equal(restored[0].content, 'the cat sat');
    assert.equal(restored[0].notes, 'a cat note');
    assert.equal(restored[1].content, 'unrelated'); // an entry the replace never touched is untouched
});

test('does not clobber an entry the user edited after the replace', function () {
    const beforeA = specOf('a', { content: 'the cat sat' });
    // The user kept editing after the replace, so the entry no longer holds the post-replace text.
    const editedA = specOf('a', { content: 'the dog ran away' });
    const restored = restoreReplacedEntries([editedA], [{ before: beforeA, afterContent: 'the dog sat', afterNotes: '' }]);
    assert.equal(restored[0], editedA); // left as the user's newer edit, not reverted
    assert.equal(restored[0].content, 'the dog ran away');
});

test('skips an entry that was deleted after the replace', function () {
    const beforeA = specOf('a', { content: 'the cat sat' });
    const other = specOf('b', { content: 'other' });
    // a is gone from the current list; restoring must not resurrect it.
    const restored = restoreReplacedEntries([other], [{ before: beforeA, afterContent: 'the dog sat', afterNotes: '' }]);
    assert.deepEqual(restored.map(function (spec) { return spec.id; }), ['b']);
});

test('an empty change set leaves every entry as-is', function () {
    const current = [specOf('a', { content: 'x' })];
    const restored = restoreReplacedEntries(current, []);
    assert.equal(restored[0], current[0]); // same object, nothing rewritten
});
