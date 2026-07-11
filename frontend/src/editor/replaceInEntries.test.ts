import assert from 'node:assert/strict';
import { test } from 'node:test';

import { countReplaceable, replaceInEntries } from './replaceInEntries.ts';
import { emptySpec } from '../xml/vibraryXml.ts';

const specOf = function (id: string, fields: { title?: string; content?: string; notes?: string }) {
    return { ...emptySpec(), id, title: fields.title ?? '', content: fields.content ?? '', notes: fields.notes ?? '' };
};

test('replaces in content and notes of selected entries, stamping only the ones that changed', function () {
    const specs = [
        specOf('a', { content: 'the cat sat', notes: 'a cat note' }),
        specOf('b', { content: 'no match here' }),
        specOf('c', { content: 'another cat' })
    ];
    const selected = new Set(['a', 'b']); // c is not selected, so its "cat" is untouched
    const result = replaceInEntries(specs, 'cat', 'dog', selected, '2026-07-11T00:00:00.000Z');

    assert.equal(result.occurrences, 2); // one in a.content, one in a.notes; b has none
    assert.equal(result.entriesChanged, 1); // only a changed
    assert.equal(result.specs[0].content, 'the dog sat');
    assert.equal(result.specs[0].notes, 'a dog note');
    assert.equal(result.specs[0].updated, '2026-07-11T00:00:00.000Z');
    assert.equal(result.specs[0].updatedBy, 'Human');
    // b was selected but had no match: left exactly as it was (same object, not re-stamped).
    assert.equal(result.specs[1], specs[1]);
    // c was not selected: its "cat" survives.
    assert.equal(result.specs[2].content, 'another cat');
});

test('titles are never rewritten (they are relatesTo identifiers)', function () {
    const specs = [specOf('a', { title: 'cat-spec', content: 'cat body' })];
    const result = replaceInEntries(specs, 'cat', 'dog', new Set(['a']), 'now');
    assert.equal(result.specs[0].title, 'cat-spec');
    assert.equal(result.specs[0].content, 'dog body');
    assert.equal(result.occurrences, 1);
});

test('an empty find term is a no-op', function () {
    const specs = [specOf('a', { content: 'x' })];
    const result = replaceInEntries(specs, '', 'y', new Set(['a']), 'now');
    assert.equal(result.occurrences, 0);
    assert.equal(result.specs, specs);
});

test('find === replace changes nothing: the entry is not re-stamped nor counted', function () {
    const specs = [specOf('a', { content: 'the cat' })];
    const result = replaceInEntries(specs, 'cat', 'cat', new Set(['a']), 'now');
    assert.equal(result.occurrences, 0);
    assert.equal(result.entriesChanged, 0);
    assert.equal(result.specs[0], specs[0]); // same object - no spurious updated stamp
});

test('countReplaceable counts occurrences across the selected entries only', function () {
    const specs = [
        specOf('a', { content: 'aa', notes: 'a' }),
        specOf('b', { content: 'aaa' })
    ];
    assert.equal(countReplaceable(specs, 'a', new Set(['a'])), 3); // 2 in content + 1 in notes
    assert.equal(countReplaceable(specs, 'a', new Set(['a', 'b'])), 6);
    assert.equal(countReplaceable(specs, '', new Set(['a', 'b'])), 0);
});
