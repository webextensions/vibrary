import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import { startAppAsync } from './testHelpers.js';

// End-to-end coverage of the files API against a real Express app serving a scratch folder: the .vibraryinclude
// gate, the create/save/read/rename/delete round trip, traversal rejection, and the summary's per-file error
// tolerance. Everything else in the suite tests these pieces in isolation; this pins how they compose over HTTP,
// envelope and status codes included.

const VALID_XML = [
    '<root>',
    '    <entries>',
    '        <entry type="spec">',
    '            <title>first-spec</title>',
    '            <content>Alpha</content>',
    '        </entry>',
    '    </entries>',
    '</root>',
    ''
].join('\n');

// Module-scope setup (this whole file is the suite): a scratch folder with an include file that shows specs/tasks
// but re-excludes one name, plus one included-but-malformed file for the summary test.
const cwd = mkdtempSync(path.join(tmpdir(), 'vibrary-files-route-'));
writeFileSync(path.join(cwd, '.vibraryinclude'), 'specs*.xml\ntasks*.xml\n!specs-hidden.xml\n');
writeFileSync(path.join(cwd, 'specs.xml'), VALID_XML);
writeFileSync(path.join(cwd, 'specs-hidden.xml'), VALID_XML);
writeFileSync(path.join(cwd, 'ideas.xml'), VALID_XML);
writeFileSync(path.join(cwd, 'specs-broken.xml'), '<root><entries><entry></root>');
writeFileSync(path.join(cwd, 'tasks.xml.schemas.json'), '{"deploy-options":{"type":"object"}}');

const { server, requestJsonAsync, sendJsonAsync } = await startAppAsync(cwd);

after(function () {
    server.close();
    rmSync(cwd, { recursive: true, force: true });
});

test('GET /files lists only included files, honoring "!" re-exclusion', async function () {
    const { status, body } = await requestJsonAsync('/files');
    assert.equal(status, 200);
    assert.equal(body.status, 'success');
    assert.deepEqual(body.output.files, ['specs-broken.xml', 'specs.xml']);
    assert.equal(body.output.hasVibraryInclude, true);
});

test('GET /files-summary tallies parseable files and marks a malformed one with null counts', async function () {
    const { body } = await requestJsonAsync('/files-summary');
    const byName = new Map(body.output.files.map(function (file) { return [file.name, file]; }));
    assert.deepEqual(byName.get('specs.xml'), { name: 'specs.xml', titles: ['first-spec'], approved: 0, total: 1 });
    assert.deepEqual(byName.get('specs-broken.xml'), { name: 'specs-broken.xml', titles: [], approved: null, total: null });
});

test('create -> save -> read -> rename -> delete round trip', async function () {
    const created = await sendJsonAsync('/files', { name: 'tasks-flow.xml' });
    assert.equal(created.status, 200);

    const saved = await sendJsonAsync('/files/tasks-flow.xml', { content: VALID_XML }, 'PUT');
    assert.equal(saved.status, 200);

    const read = await requestJsonAsync('/files/tasks-flow.xml');
    assert.equal(read.body.output.content, VALID_XML);

    const renamed = await sendJsonAsync('/files/tasks-flow.xml/rename', { newName: 'tasks-flow2.xml' });
    assert.equal(renamed.status, 200);
    assert.equal((await requestJsonAsync('/files/tasks-flow.xml')).status, 404);

    const deleted = await requestJsonAsync('/files/tasks-flow2.xml', { method: 'DELETE' });
    assert.equal(deleted.status, 200);
    assert.equal((await requestJsonAsync('/files/tasks-flow2.xml')).status, 404);
});

test('create rejects invalid, non-included, and duplicate names with the right statuses', async function () {
    assert.equal((await sendJsonAsync('/files', { name: 'notes.xml' })).status, 400);
    assert.equal((await sendJsonAsync('/files', { name: 'ideas-new.xml' })).status, 400); // not included by the include file
    assert.equal((await sendJsonAsync('/files', { name: 'specs.xml' })).status, 409);
});

test('reads reject traversal and answer 404 for excluded or missing files', async function () {
    assert.equal((await requestJsonAsync('/files/..%2Fspecs.xml')).status, 400);
    // Included-by-family but re-excluded by "!": invisible, and reported as absent rather than forbidden.
    assert.equal((await requestJsonAsync('/files/specs-hidden.xml')).status, 404);
    assert.equal((await requestJsonAsync('/files/specs-nope.xml')).status, 404);
});

test('the schema-file sidecar route reads by its own tight name shape', async function () {
    const read = await requestJsonAsync('/schema-file/tasks.xml.schemas.json');
    assert.equal(read.status, 200);
    assert.deepEqual(JSON.parse(read.body.output.content), { 'deploy-options': { type: 'object' } });

    // Only "<vibrary>.xml.schemas.json" shapes resolve; anything else is rejected before touching the filesystem.
    assert.equal((await requestJsonAsync('/schema-file/notes.json')).status, 400);
    assert.equal((await requestJsonAsync('/schema-file/..%2Ftasks.xml.schemas.json')).status, 400);
    assert.equal((await requestJsonAsync('/schema-file/specs.xml.schemas.json')).status, 404);
});
