import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import { startAppAsync } from './testHelpers.js';

// Integration coverage for the search router: the query floor, the match shape a clicked result relies on
// (entryIndex/field/snippet), and the comma-separated `files` narrowing that only this route layer parses
// (searchVibrary.test.js already covers the search logic itself).

const entryXml = function (title, content) {
    return `<entry type="spec"><title>${title}</title><content>${content}</content></entry>`;
};

const cwd = mkdtempSync(path.join(tmpdir(), 'vibrary-search-route-'));
writeFileSync(path.join(cwd, '.vibraryinclude'), 'specs*.xml\n');
writeFileSync(
    path.join(cwd, 'specs.xml'),
    `<root><entries>${entryXml('first-entry', 'plain text')}${entryXml('second-entry', 'the needle sits here')}</entries></root>`
);
writeFileSync(
    path.join(cwd, 'specs-other.xml'),
    `<root><entries>${entryXml('third-entry', 'another needle')}</entries></root>`
);

const { server, requestJsonAsync } = await startAppAsync(cwd);

after(function () {
    server.close();
    rmSync(cwd, { recursive: true, force: true });
});

test('an empty or too-short query answers an empty result set, not an error', async function () {
    for (const query of ['', 'q=', 'q=x']) {
        const { status, body } = await requestJsonAsync(`/search?${query}`);
        assert.equal(status, 200);
        assert.deepEqual(body.output, { results: [], truncated: false });
    }
});

test('a match carries the entry index, matched field, and snippet the editor needs', async function () {
    const { body } = await requestJsonAsync('/search?q=needle');
    assert.deepEqual(body.output.results, [
        { path: 'specs-other.xml', matches: [{ entryIndex: 0, title: 'third-entry', field: 'content', snippet: 'another needle' }] },
        { path: 'specs.xml', matches: [{ entryIndex: 1, title: 'second-entry', field: 'content', snippet: 'the needle sits here' }] }
    ]);
    assert.equal(body.output.truncated, false);
});

test('the comma-separated files parameter narrows the search scope', async function () {
    const { body } = await requestJsonAsync('/search?q=needle&files=specs.xml');
    assert.deepEqual(body.output.results.map(function (result) { return result.path; }), ['specs.xml']);
});
