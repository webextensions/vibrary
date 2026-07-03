import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { searchVibrary } from './searchVibrary.js';

// A scratch workspace with an include file and one vibrary file: entry 0 mentions the needle twice in its content,
// entry 1 not at all, entry 2 once in its notes. Entry granularity and entry indexes are the contract the editor's
// highlight addressing depends on (a clicked result opens specs[entryIndex]).
const makeWorkspace = function () {
    const directory = mkdtempSync(path.join(tmpdir(), 'vibrary-search-'));
    writeFileSync(path.join(directory, '.vibraryinclude'), 'specs*.xml\n');
    mkdirSync(path.join(directory, 'docs'));
    writeFileSync(path.join(directory, 'docs', 'specs-sample.xml'), [
        '<root><entries>',
        '  <entry type="spec"><title>first-entry</title><content>needle here\nand needle again</content></entry>',
        '  <entry type="spec"><title>second-entry</title><content>nothing relevant</content></entry>',
        '  <entry type="task"><title>third-entry</title><content>also nothing</content><notes>a needle in the notes</notes></entry>',
        '</entries></root>'
    ].join('\n'));
    return directory;
};

test('search matches entries (not lines): one match per entry with its index and field', async function () {
    const { results, truncated } = await searchVibrary(makeWorkspace(), 'needle');
    assert.equal(truncated, false);
    assert.equal(results.length, 1);
    assert.deepEqual(results[0].matches.map(function (match) { return match.entryIndex; }), [0, 2]);
    assert.deepEqual(results[0].matches.map(function (match) { return match.field; }), ['content', 'notes']);
    assert.equal(results[0].matches[0].title, 'first-entry');
    // The snippet is the line around the FIRST occurrence, not a count of occurrences.
    assert.equal(results[0].matches[0].snippet, 'needle here');
});

test('search looks at parsed fields, so XML markup never matches', async function () {
    // "entry" and "task" occur in every tag/attribute of the raw XML but in no field text.
    const directory = makeWorkspace();
    assert.deepEqual(await searchVibrary(directory, 'entries'), { results: [], truncated: false });
    const taskHits = await searchVibrary(directory, 'task');
    assert.equal(taskHits.results.length, 0);
});

test('search enforces the two-character floor and trims the needle', async function () {
    const directory = makeWorkspace();
    assert.deepEqual(await searchVibrary(directory, 'n'), { results: [], truncated: false });
    const padded = await searchVibrary(directory, '  needle ');
    assert.equal(padded.results[0].matches.length, 2);
});
