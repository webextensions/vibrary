import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { searchVibrary } from './searchVibrary.js';
import { saveTranscriptAsync } from '../shared/transcriptStore.js';

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

test('a deeply-indented line whose visible text fits is returned whole, not windowed', async function () {
    const directory = mkdtempSync(path.join(tmpdir(), 'vibrary-search-indent-'));
    writeFileSync(path.join(directory, '.vibraryinclude'), 'specs*.xml\n');
    // The match sits on a heavily-indented interior line: raw length exceeds the cap, but its trimmed text ("findme")
    // is short, so the snippet should be that text with no ellipsis - not a window over the blank indentation.
    const indentedLine = `${' '.repeat(210)}findme`;
    writeFileSync(path.join(directory, 'specs.xml'), `<root><entries><entry type="spec"><title>t</title><content>intro\n${indentedLine}</content></entry></entries></root>`);

    const { results } = await searchVibrary(directory, 'findme');
    const snippet = results[0]?.matches[0]?.snippet;
    assert.equal(snippet, 'findme');
});

test('matchCase distinguishes identifiers the default fold conflates', async function () {
    const directory = mkdtempSync(path.join(tmpdir(), 'vibrary-search-case-'));
    writeFileSync(path.join(directory, '.vibraryinclude'), 'specs*.xml\n');
    writeFileSync(path.join(directory, 'specs.xml'), [
        '<root><entries>',
        '  <entry type="spec"><title>upper</title><content>the API surface</content></entry>',
        '  <entry type="spec"><title>lower</title><content>an api client</content><labels><label>API</label></labels></entry>',
        '</entries></root>'
    ].join('\n'));

    // Default: both entries match (the no-regression behavior).
    const folded = await searchVibrary(directory, 'API');
    assert.deepEqual(folded.results[0].matches.map(function (match) { return match.entryIndex; }), [0, 1]);

    // Case-sensitive: entry 0 matches in content; entry 1's content is lowercase, but its LABEL carries the exact
    // casing - labels honor the flag too.
    const exact = await searchVibrary(directory, 'API', { matchCase: true });
    assert.deepEqual(exact.results[0].matches.map(function (match) { return match.entryIndex; }), [0, 1]);
    assert.equal(exact.results[0].matches[1].field, 'labels');

    // Case-sensitive lowercase query no longer matches the uppercase occurrence.
    const lower = await searchVibrary(directory, 'api', { matchCase: true });
    assert.deepEqual(lower.results[0].matches.map(function (match) { return match.entryIndex; }), [1]);
    assert.equal(lower.results[0].matches[0].field, 'content');
});

test('wholeWord excludes containing words but keeps hyphenated-title neighbors', async function () {
    const directory = mkdtempSync(path.join(tmpdir(), 'vibrary-search-word-'));
    writeFileSync(path.join(directory, '.vibraryinclude'), 'specs*.xml\n');
    writeFileSync(path.join(directory, 'specs.xml'), [
        '<root><entries>',
        // "api" only inside another word: excluded under wholeWord.
        '  <entry type="spec"><title>capillary-notes</title><content>capillary action</content></entry>',
        // A later standalone occurrence after a containing word: the scan must keep looking past "capillary".
        '  <entry type="spec"><title>mixed</title><content>capillary first, then the api itself</content></entry>',
        // Hyphen neighbors are word boundaries, so whole-word "auth" matches the normalized title "auth-token".
        '  <entry type="spec"><title>auth-token</title><content>token refresh rules</content></entry>',
        '</entries></root>'
    ].join('\n'));

    const api = await searchVibrary(directory, 'api', { wholeWord: true });
    assert.deepEqual(api.results[0].matches.map(function (match) { return match.entryIndex; }), [1]);
    assert.ok(api.results[0].matches[0].snippet.includes('the api itself'));

    const auth = await searchVibrary(directory, 'auth', { wholeWord: true });
    assert.deepEqual(auth.results[0].matches.map(function (match) { return match.entryIndex; }), [2]);
    assert.equal(auth.results[0].matches[0].field, 'title');
});

test('operators gate entries and a constraint-only query is valid with an empty needle', async function () {
    const directory = mkdtempSync(path.join(tmpdir(), 'vibrary-search-operators-'));
    writeFileSync(path.join(directory, '.vibraryinclude'), 'specs*.xml\ntasks*.xml\n');
    writeFileSync(path.join(directory, 'specs.xml'), [
        '<root><entries>',
        '  <entry type="spec"><title>spec-open</title><createdBy>AI</createdBy><content>first line here\nsecond line</content><labels><label>auth</label></labels></entry>',
        '  <entry type="spec"><title>spec-signed</title><approved>0000</approved><content>drifted</content></entry>',
        '</entries></root>'
    ].join('\n'));
    writeFileSync(path.join(directory, 'tasks.xml'), [
        '<root><entries>',
        '  <entry type="task"><title>task-one</title><createdBy>Human</createdBy><content>a task</content></entry>',
        '</entries></root>'
    ].join('\n'));

    // Constraint-only: the MIN_QUERY_LENGTH floor applies to the needle only, so "type:spec" alone lists every spec,
    // with the head of the content as the snippet (there is no needle to window around).
    const specsOnly = await searchVibrary(directory, 'type:spec');
    assert.deepEqual(specsOnly.results[0].matches.map(function (match) { return match.title; }), ['spec-open', 'spec-signed']);
    assert.equal(specsOnly.results[0].matches[0].snippet, 'first line here');

    // approved: speaks approvalState's vocabulary (stale = signed off, content since changed).
    const stale = await searchVibrary(directory, 'approved:stale');
    assert.deepEqual(stale.results[0].matches.map(function (match) { return match.title; }), ['spec-signed']);

    // Constraints AND together with each other and the needle; by: matches createdBy.
    const combined = await searchVibrary(directory, 'type:spec by:ai line');
    assert.deepEqual(combined.results[0].matches.map(function (match) { return match.title; }), ['spec-open']);

    // Negation excludes; label: matches whole labels case-insensitively; file: narrows by gitignore-style glob.
    const negated = await searchVibrary(directory, '-type:spec task');
    assert.deepEqual(negated.results.map(function (file) { return file.path; }), ['tasks.xml']);
    const labeled = await searchVibrary(directory, 'label:AUTH');
    assert.deepEqual(labeled.results[0].matches.map(function (match) { return match.title; }), ['spec-open']);
    const scoped = await searchVibrary(directory, 'file:tasks*.xml task');
    assert.deepEqual(scoped.results.map(function (file) { return file.path; }), ['tasks.xml']);

    // A query with neither a viable needle nor any constraint still answers nothing (the floor's remaining job).
    assert.deepEqual(await searchVibrary(directory, 'x'), { results: [], truncated: false });
});

test('in:transcripts retargets the search at the persisted run transcripts', async function () {
    const workspace = makeWorkspace();
    await saveTranscriptAsync(workspace, {
        route: '/api/run-task',
        startedAt: '2026-06-01T10:00:00.000Z',
        endedAt: '2026-06-01T10:01:00.000Z',
        outcome: 'success',
        error: null,
        truncated: false,
        lines: ['{"type":"user_prompt","text":"find the sekrit token"}']
    });
    const scoped = await searchVibrary(workspace, 'in:transcripts sekrit');
    // Entry results stay empty in transcript scope; the transcript match carries its listing metadata + snippet.
    assert.deepEqual(scoped.results, []);
    assert.equal(scoped.transcripts.length, 1);
    assert.equal(scoped.transcripts[0].route, 'run-task');
    assert.match(scoped.transcripts[0].snippet, /sekrit/);
    // The same needle without the scope operator still searches entries only (and finds nothing here).
    const unscoped = await searchVibrary(workspace, 'sekrit');
    assert.equal(unscoped.transcripts, undefined);
    assert.deepEqual(unscoped.results, []);
    // The needle floor applies in transcript scope too.
    const tooShort = await searchVibrary(workspace, 'in:transcripts s');
    assert.deepEqual(tooShort.transcripts, []);
});
