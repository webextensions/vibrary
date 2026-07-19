import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildSplitPrompt, parseSplitParts } from './runClaudeSplit.js';

// The split's two mechanical contracts: the prompt carries the whole entry and demands bare JSON, and the parser is
// lenient about wrapping but strict about shape - half-formed parts must reject the whole split.

test('the prompt carries the entry and the 2-to-4 parts JSON demand', function () {
    const prompt = buildSplitPrompt({ title: 'huge-spec', content: 'Everything at once.', notes: 'ugh' });
    assert.match(prompt, /between 2 and 4 smaller/);
    assert.match(prompt, /Title: huge-spec/);
    assert.match(prompt, /Notes: ugh/);
    assert.match(prompt, /ONLY one JSON array/);
});

test('parseSplitParts accepts wrapped JSON, normalizes titles, and defaults notes', function () {
    const output = 'Here you go:\n```json\n[{"title": "First Part!", "content": " do a "}, {"title": "second-part", "content": "do b", "notes": "n"}]\n```';
    assert.deepEqual(parseSplitParts(output), [
        { title: 'first-part', content: 'do a', notes: '' },
        { title: 'second-part', content: 'do b', notes: 'n' }
    ]);
});

test('parseSplitParts rejects no array, bad JSON, wrong counts, and half-formed parts', function () {
    assert.throws(function () { parseSplitParts('no json here'); }, /did not answer with a JSON array/);
    assert.throws(function () { parseSplitParts('[{"title": broken]'); }, /not valid JSON/);
    assert.throws(function () { parseSplitParts('[{"title":"only-one","content":"x"}]'); }, /between 2 and 6/);
    const seven = JSON.stringify(Array.from({ length: 7 }, function (_unused, index) {
        return { title: `part-${index}`, content: 'x' };
    }));
    assert.throws(function () { parseSplitParts(seven); }, /between 2 and 6/);
    assert.throws(function () { parseSplitParts('[{"title":"a","content":"x"},{"title":"","content":"y"}]'); }, /Part 2 needs a title and content/);
    assert.throws(function () { parseSplitParts('[{"title":"a","content":"x"},"nope"]'); }, /Part 2 is not an object/);
});
