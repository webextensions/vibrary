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
    // Each match carries its entry's type (entry 0 is a spec, entry 2 a task), so the UI can label mixed results.
    assert.deepEqual(results[0].matches.map(function (match) { return match.type; }), ['spec', 'task']);
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

test('search matches an entry by its labels, ranked after the text fields', async function () {
    const directory = mkdtempSync(path.join(tmpdir(), 'vibrary-search-labels-'));
    writeFileSync(path.join(directory, '.vibraryinclude'), 'specs*.xml\n');
    writeFileSync(path.join(directory, 'specs.xml'), [
        '<root><entries>',
        // Entry 0: the term lives ONLY in a label - unmatchable before labels were searched.
        '  <entry type="spec"><title>alpha</title><content>plain body</content>',
        '    <labels><label>backend</label><label>urgent</label></labels></entry>',
        // Entry 1: the term is in the content AND a label - the content snippet must win (labels rank last).
        '  <entry type="spec"><title>beta</title><content>a backend change</content>',
        '    <labels><label>backend</label></labels></entry>',
        '</entries></root>'
    ].join('\n'));

    const { results } = await searchVibrary(directory, 'backend');
    const matches = results[0].matches;
    assert.deepEqual(matches.map(function (match) { return match.entryIndex; }), [0, 1]);
    // Entry 0 matched via its labels, with only the label(s) containing the needle in the snippet.
    assert.equal(matches[0].field, 'labels');
    assert.equal(matches[0].snippet, 'backend');
    // Entry 1 matched via content first, so the richer text snippet wins over the label.
    assert.equal(matches[1].field, 'content');
    assert.equal(matches[1].snippet, 'a backend change');
});

test('a match far into a long line is windowed so the snippet still contains the term', async function () {
    const directory = mkdtempSync(path.join(tmpdir(), 'vibrary-search-snippet-'));
    writeFileSync(path.join(directory, '.vibraryinclude'), 'specs*.xml\n');
    // One long single-line content with the needle ~250 chars in - past the 200-char snippet cap, so a from-the-start
    // slice would omit it entirely.
    const content = `${'a'.repeat(250)}zzz findme zzz`;
    writeFileSync(path.join(directory, 'specs.xml'), `<root><entries><entry type="spec"><title>long</title><content>${content}</content></entry></entries></root>`);

    const { results } = await searchVibrary(directory, 'findme');
    const snippet = results[0].matches[0].snippet;
    // The whole point: the searched term is actually in the snippet (a start-anchored slice would have dropped it).
    assert.ok(snippet.includes('findme'), `snippet should contain the match, got ${JSON.stringify(snippet)}`);
    // The clipped leading end is marked, and the line ends at the match's tail so there is no trailing ellipsis.
    assert.ok(snippet.startsWith('...'), 'a clipped start is marked with an ellipsis');
    assert.ok(!snippet.endsWith('...'), 'the window reaches the line end, so no trailing ellipsis');
});
