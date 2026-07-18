import assert from 'node:assert/strict';
import { test } from 'node:test';

import { countBreakingReferences } from './breakingReferences.ts';

const summary = function (name: string, titles: string[]): { name: string; titles: string[]; labels: string[]; approved: number | null; total: number | null; brokenReferences: number | null } {
    return { name, titles, labels: [], approved: 0, total: titles.length, brokenReferences: 0 };
};

test('counts references from surviving files to titles the delete removes', function () {
    const summaries = [summary('specs.xml', ['alpha', 'beta']), summary('tasks.xml', ['gamma'])];
    // tasks.xml#gamma references alpha (in the file being deleted); specs.xml#beta references alpha too (going away too).
    const backlinks = { alpha: [{ file: 'tasks.xml', title: 'gamma' }, { file: 'specs.xml', title: 'beta' }] };
    // Deleting specs.xml removes alpha + beta; only the tasks.xml -> alpha link breaks (the specs.xml -> alpha one dies too).
    assert.equal(countBreakingReferences(['specs.xml'], summaries, backlinks), 1);
});

test('is 0 when the removed title still exists in a surviving file (duplicate title keeps resolving)', function () {
    const summaries = [summary('specs.xml', ['shared']), summary('specs-two.xml', ['shared']), summary('tasks.xml', ['t'])];
    const backlinks = { shared: [{ file: 'tasks.xml', title: 't' }] };
    // Deleting specs.xml leaves 'shared' still present in specs-two.xml, so the reference does not break.
    assert.equal(countBreakingReferences(['specs.xml'], summaries, backlinks), 0);
});

test('is 0 when nothing references the deleted file\'s entries', function () {
    const summaries = [summary('specs.xml', ['alpha']), summary('tasks.xml', ['gamma'])];
    assert.equal(countBreakingReferences(['specs.xml'], summaries, {}), 0);
});

test('a title colliding with an Object.prototype key does not read the inherited method', function () {
    const summaries = [summary('specs.xml', ['constructor']), summary('tasks.xml', ['t'])];
    const backlinks = { constructor: [{ file: 'tasks.xml', title: 't' }] };
    assert.equal(countBreakingReferences(['specs.xml'], summaries, backlinks), 1);
});

test('counts across a multi-file delete, ignoring references between the deleted files', function () {
    const summaries = [summary('a.xml', ['x']), summary('b.xml', ['y']), summary('keep.xml', ['k'])];
    // keep.xml#k -> x breaks; b.xml#y -> x is itself deleted so it does not count.
    const backlinks = { x: [{ file: 'keep.xml', title: 'k' }, { file: 'b.xml', title: 'y' }] };
    assert.equal(countBreakingReferences(['a.xml', 'b.xml'], summaries, backlinks), 1);
});
