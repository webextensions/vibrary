import assert from 'node:assert/strict';
import { test } from 'node:test';

import { titlesInOtherFiles } from './crossFileTitles.ts';

const summary = function (name: string, titles: string[]) {
    return { name, titles, approved: null, total: null, brokenReferences: null };
};

test('collects titles from every file except the current one', function () {
    const summaries = [summary('specs.xml', ['a', 'b']), summary('specs-ui.xml', ['b', 'c'])];
    const result = titlesInOtherFiles(summaries, 'specs.xml');
    // 'a' and 'b' belong to the excluded current file; 'b' still appears via specs-ui.xml, plus 'c'.
    assert.deepEqual([...result].toSorted(function (a, b) { return a.localeCompare(b); }), ['b', 'c']);
});

test('a null current path (a brand-new unsaved file) treats every summarized file as another', function () {
    const summaries = [summary('a.xml', ['x']), summary('b.xml', ['y'])];
    assert.deepEqual([...titlesInOtherFiles(summaries, null)].toSorted(function (a, b) { return a.localeCompare(b); }), ['x', 'y']);
});

test('empty titles are ignored so an unnamed entry never reads as a duplicate', function () {
    const summaries = [summary('a.xml', ['x', '']), summary('b.xml', [''])];
    assert.deepEqual([...titlesInOtherFiles(summaries, 'other.xml')], ['x']);
});
