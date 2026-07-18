import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import { startAppAsync } from '../shared/testHelpers.js';

// End-to-end coverage for POST /rankings/competitions: a fake `claude` on PATH (the agents.test.js technique) plays
// the judge, so the real spawn -> verdict-parse -> record -> stream plumbing runs unstubbed. The folder holds exactly
// two idea entries, making every least-met pairing deterministic (idea-one vs idea-two).

const FAKE_CLAUDE = String.raw`#!/bin/sh
case "$2" in
    *BADWINNER*) printf '{"winner":"somebody-else","rationale":"confused"}\n' ;;
    *) printf 'Verdict:\n{"winner":"idea-one","rationale":"broader impact"}\n' ;;
esac
`;

const fixtureDirectory = mkdtempSync(path.join(tmpdir(), 'vibrary-fake-claude-judge-'));
writeFileSync(path.join(fixtureDirectory, 'claude'), FAKE_CLAUDE);
chmodSync(path.join(fixtureDirectory, 'claude'), 0o755);
const originalPath = process.env.PATH;
process.env.PATH = `${fixtureDirectory}${path.delimiter}${originalPath}`;

const cwd = mkdtempSync(path.join(tmpdir(), 'vibrary-competitions-route-'));
writeFileSync(path.join(cwd, '.vibraryinclude'), 'ideas*.xml\n');
writeFileSync(path.join(cwd, 'ideas.xml'), [
    '<root><entries>',
    '  <entry type="idea"><title>idea-one</title><content>First idea body.</content></entry>',
    '  <entry type="idea"><title>idea-two</title><content>Second idea body.</content></entry>',
    '</entries></root>'
].join('\n'));

const { server, requestJsonAsync, sendJsonAsync } = await startAppAsync(cwd);

after(function () {
    server.close();
    process.env.PATH = originalPath;
    rmSync(fixtureDirectory, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
});

const streamLinesAsync = async function (payload) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/rankings/competitions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    assert.equal(response.status, 200);
    const text = await response.text();
    return text.trim().split('\n').map(function (line) {
        return /** @type {any} */ (JSON.parse(line));
    });
};

test('count and scope are validated before any run starts', async function () {
    const badCount = await sendJsonAsync('/rankings/competitions', { count: 0 });
    assert.equal(badCount.status, 400);
    const badScope = await sendJsonAsync('/rankings/competitions', { count: 1, types: 'task' });
    assert.equal(badScope.status, 400);
    assert.match(badScope.body.errorMessage, /at least two entries in scope/);
});

test('a batch judges pairings, records AI matches as it goes, and streams each verdict', async function () {
    const lines = await streamLinesAsync({ count: 2 });
    const starts = lines.filter(function (line) { return line.type === 'competition_start'; });
    const results = lines.filter(function (line) { return line.type === 'competition_result'; });
    assert.equal(starts.length, 2);
    assert.equal(results.length, 2);
    // The start line carries the exact judge prompt (run transparency), naming both contenders.
    assert.match(starts[0].prompt, /idea-one/);
    assert.match(starts[0].prompt, /idea-two/);
    assert.equal(results[0].match.judge, 'AI');
    assert.equal(results[0].match.winnerTitle, 'idea-one');
    assert.equal(results[0].match.rationale, 'broader impact');
    assert.deepEqual(lines.at(-1), { type: '_exit', code: 0, error: null });

    // The records landed in the log and replay into the standings.
    const { body } = await requestJsonAsync('/rankings');
    assert.equal(body.output.matches.length, 2);
    const winner = body.output.standings.find(function (row) { return row.title === 'idea-one'; });
    assert.deepEqual({ wins: winner.wins, games: winner.games }, { wins: 2, games: 2 });
});

test('an invalid verdict fails the run with a clear error but keeps earlier records', async function () {
    const before = (await requestJsonAsync('/rankings')).body.output.matches.length;
    // The guidance lands in the judge prompt, steering the fake to a winner that is neither contender.
    const lines = await streamLinesAsync({ count: 2, instructions: 'BADWINNER' });
    const exit = lines.at(-1);
    assert.equal(exit.code, 1);
    assert.match(exit.error, /neither contender/);
    // The first pairing failed, so nothing was recorded beyond what already existed.
    const after_ = (await requestJsonAsync('/rankings')).body.output.matches.length;
    assert.equal(after_, before);
});

test('a competitionPrompt setting replaces the judge prompt for the very next run', async function () {
    // The template drops the built-in framing but keeps the entry placeholders (the fake judge reads Entry A's title
    // out of the prompt). Written directly as the settings file - the same bytes the settings route would persist.
    mkdirSync(path.join(cwd, '.vibrary'), { recursive: true });
    const settingsPath = path.join(cwd, '.vibrary', 'settings.local.json');
    writeFileSync(settingsPath, JSON.stringify({ competitionPrompt: 'CUSTOM JUDGE FRAMING\n{{entryA}}\n{{entryB}}' }));
    try {
        const lines = await streamLinesAsync({ count: 1 });
        const start = lines.find(function (line) { return line.type === 'competition_start'; });
        assert.match(start.prompt, /^CUSTOM JUDGE FRAMING/);
        assert.match(start.prompt, /Entry A - "idea-/);
        // The verdict-format demand survives every template, so parsing cannot be configured away.
        assert.match(start.prompt, /Respond with ONLY one JSON object/);
        assert.doesNotMatch(start.prompt, /head-to-head competition/);
        assert.deepEqual(lines.at(-1), { type: '_exit', code: 0, error: null });
    } finally {
        rmSync(settingsPath);
    }
});
