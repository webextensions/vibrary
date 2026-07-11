import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import { startAppAsync } from '../shared/testHelpers.js';

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

test('GET /version answers the package version', async function () {
    const { status, body } = await requestJsonAsync('/version');
    assert.equal(status, 200);
    assert.match(body.output.version, /^\d+\.\d+\.\d+/);
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
    assert.deepEqual(byName.get('specs.xml'), { name: 'specs.xml', titles: ['first-spec'], approved: 0, total: 1, brokenReferences: 0 });
    assert.deepEqual(byName.get('specs-broken.xml'), { name: 'specs-broken.xml', titles: [], approved: null, total: null, brokenReferences: null });
});

test('GET /files-summary counts each file\'s dangling relatesTo references (folder-wide)', async function () {
    const brokenCwd = mkdtempSync(path.join(tmpdir(), 'vibrary-broken-refs-'));
    writeFileSync(path.join(brokenCwd, '.vibraryinclude'), 'specs*.xml\n');
    // 'real' and 'other' exist (the latter in a sibling file); 'ghostA'/'ghostB' resolve to nothing.
    writeFileSync(path.join(brokenCwd, 'specs.xml'), [
        '<root><entries>',
        '  <entry type="spec"><title>real</title><content>x</content></entry>',
        '  <entry type="spec"><title>src</title><content>y</content><relatesTo><ref>real</ref><ref>other</ref><ref>ghostA</ref><ref>ghostB</ref></relatesTo></entry>',
        '</entries></root>'
    ].join('\n'));
    writeFileSync(path.join(brokenCwd, 'specs-two.xml'), '<root><entries><entry type="spec"><title>other</title><content>z</content></entry></entries></root>');
    const app = await startAppAsync(brokenCwd);
    try {
        const { body } = await app.requestJsonAsync('/files-summary');
        const file = body.output.files.find(function (entry) { return entry.name === 'specs.xml'; });
        // 'real' (same file) and 'other' (sibling file) resolve; only 'ghostA' and 'ghostB' are broken.
        assert.equal(file.brokenReferences, 2);
    } finally {
        app.server.close();
        rmSync(brokenCwd, { recursive: true, force: true });
    }
});

test('GET /files-summary builds a folder-wide reverse-reference (backlinks) map, skipping dangling targets', async function () {
    const cwd = mkdtempSync(path.join(tmpdir(), 'vibrary-backlinks-'));
    writeFileSync(path.join(cwd, '.vibraryinclude'), 'specs*.xml\n');
    // 'src' references 'real' (same file), 'other' (sibling file), and 'ghost' (nonexistent).
    writeFileSync(path.join(cwd, 'specs.xml'), [
        '<root><entries>',
        '  <entry type="spec"><title>real</title><content>x</content></entry>',
        '  <entry type="spec"><title>src</title><content>y</content><relatesTo><ref>real</ref><ref>other</ref><ref>ghost</ref></relatesTo></entry>',
        '</entries></root>'
    ].join('\n'));
    writeFileSync(path.join(cwd, 'specs-two.xml'), '<root><entries><entry type="spec"><title>other</title><content>z</content></entry></entries></root>');
    const app = await startAppAsync(cwd);
    try {
        const { body } = await app.requestJsonAsync('/files-summary');
        const backlinks = body.output.backlinks;
        // 'real' and 'other' both exist and are referenced by 'src' in specs.xml.
        assert.deepEqual(backlinks.real, [{ file: 'specs.xml', title: 'src' }]);
        assert.deepEqual(backlinks.other, [{ file: 'specs.xml', title: 'src' }]);
        // 'ghost' is not a real title, so it is nobody's viewable entry and never keyed.
        assert.equal(Object.hasOwn(backlinks, 'ghost'), false);
    } finally {
        app.server.close();
        rmSync(cwd, { recursive: true, force: true });
    }
});

test('create -> save -> read -> rename -> delete round trip', async function () {
    const created = await sendJsonAsync('/files', { name: 'tasks-flow.xml' });
    assert.equal(created.status, 200);

    const saved = await sendJsonAsync('/files/tasks-flow.xml', { content: VALID_XML }, 'PUT');
    assert.equal(saved.status, 200);

    const read = await requestJsonAsync('/files/tasks-flow.xml');
    assert.equal(read.body.output.content, VALID_XML);

    // The save is an atomic temp-file + rename; its temp file (named "<file>.<hash>") must not survive the request.
    assert.deepEqual(readdirSync(cwd).filter(function (entry) { return entry.startsWith('tasks-flow.xml.'); }), []);

    const renamed = await sendJsonAsync('/files/tasks-flow.xml/rename', { newName: 'tasks-flow2.xml' });
    assert.equal(renamed.status, 200);
    assert.equal((await requestJsonAsync('/files/tasks-flow.xml')).status, 404);

    const deleted = await requestJsonAsync('/files/tasks-flow2.xml', { method: 'DELETE' });
    assert.equal(deleted.status, 200);
    assert.equal((await requestJsonAsync('/files/tasks-flow2.xml')).status, 404);
});

test('save detects a concurrent on-disk change via the baseFileHash handshake', async function () {
    await sendJsonAsync('/files', { name: 'tasks-conflict.xml' });
    await sendJsonAsync('/files/tasks-conflict.xml', { content: VALID_XML }, 'PUT');

    // Load the file (capturing its version token), then simulate an agent editing it on disk behind the editor.
    const loaded = await requestJsonAsync('/files/tasks-conflict.xml');
    assert.equal(typeof loaded.body.output.fileHash, 'string');
    writeFileSync(path.join(cwd, 'tasks-conflict.xml'), VALID_XML.replace('Alpha', 'AgentEdit'));

    // A save based on the stale token is refused; the disk content survives.
    const conflicted = await sendJsonAsync('/files/tasks-conflict.xml', { content: VALID_XML.replace('Alpha', 'UserEdit'), baseFileHash: loaded.body.output.fileHash }, 'PUT');
    assert.equal(conflicted.status, 409);
    assert.match((await requestJsonAsync('/files/tasks-conflict.xml')).body.output.content, /AgentEdit/);

    // Re-loading yields the current token, with which the save goes through and returns the saved content's new token.
    const reloaded = await requestJsonAsync('/files/tasks-conflict.xml');
    const saved = await sendJsonAsync('/files/tasks-conflict.xml', { content: VALID_XML.replace('Alpha', 'UserEdit'), baseFileHash: reloaded.body.output.fileHash }, 'PUT');
    assert.equal(saved.status, 200);
    assert.equal(typeof saved.body.output.fileHash, 'string');
    assert.match((await requestJsonAsync('/files/tasks-conflict.xml')).body.output.content, /UserEdit/);

    // Without the field the old blind-write semantics remain (the confirmed "Overwrite" path); a non-string is a 400,
    // and a save against a since-deleted file conflicts rather than silently recreating it.
    assert.equal((await sendJsonAsync('/files/tasks-conflict.xml', { content: VALID_XML }, 'PUT')).status, 200);
    assert.equal((await sendJsonAsync('/files/tasks-conflict.xml', { content: VALID_XML, baseFileHash: 42 }, 'PUT')).status, 400);
    const currentHash = (await requestJsonAsync('/files/tasks-conflict.xml')).body.output.fileHash;
    await requestJsonAsync('/files/tasks-conflict.xml', { method: 'DELETE' });
    assert.equal((await sendJsonAsync('/files/tasks-conflict.xml', { content: VALID_XML, baseFileHash: currentHash }, 'PUT')).status, 409);
});

test('rename allows a case-only change but still refuses a genuinely different existing target', async function () {
    await sendJsonAsync('/files/tasks-case.xml', { content: VALID_XML }, 'PUT');

    // A case-only rename must not be mistaken for an overwrite: on a case-insensitive FS the new name resolves to the
    // same inode, and the identity check lets it through rather than returning a misleading 409.
    const cased = await sendJsonAsync('/files/tasks-case.xml/rename', { newName: 'tasks-Case.xml' });
    assert.equal(cased.status, 200);

    // Renaming onto a DIFFERENT existing file is still refused.
    await sendJsonAsync('/files/tasks-other.xml', { content: VALID_XML }, 'PUT');
    const collide = await sendJsonAsync('/files/tasks-Case.xml/rename', { newName: 'tasks-other.xml' });
    assert.equal(collide.status, 409);
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

test('move-entries relocates selected entries into another file, appended after its own', async function () {
    const twoEntries = [
        '<root>', '    <entries>',
        '        <entry type="spec"><title>keep-me</title><content>K</content></entry>',
        '        <entry type="spec"><title>move-me</title><content>M</content></entry>',
        '    </entries>', '</root>', ''
    ].join('\n');
    writeFileSync(path.join(cwd, 'specs-src.xml'), twoEntries);
    writeFileSync(path.join(cwd, 'tasks-dst.xml'), VALID_XML); // one entry: first-spec

    const loaded = await requestJsonAsync('/files/specs-src.xml');
    const moved = await sendJsonAsync('/files/specs-src.xml/move-entries', {
        targetName: 'tasks-dst.xml', indexes: [1], baseFileHash: loaded.body.output.fileHash
    });
    assert.equal(moved.status, 200);
    assert.equal(moved.body.output.movedCount, 1);

    const sourceAfter = (await requestJsonAsync('/files/specs-src.xml')).body.output.content;
    assert.match(sourceAfter, /keep-me/);
    assert.doesNotMatch(sourceAfter, /move-me/);

    const targetAfter = (await requestJsonAsync('/files/tasks-dst.xml')).body.output.content;
    assert.match(targetAfter, /first-spec/);
    assert.ok(targetAfter.indexOf('first-spec') < targetAfter.indexOf('move-me'), 'moved entry is appended after the target\'s existing entries');
});

test('move-entries refuses the same file, a stale hash, an out-of-range index, a non-included target, and an empty set', async function () {
    writeFileSync(path.join(cwd, 'specs-mv2.xml'), VALID_XML);
    writeFileSync(path.join(cwd, 'tasks-mv2.xml'), VALID_XML);

    assert.equal((await sendJsonAsync('/files/specs-mv2.xml/move-entries', { targetName: 'specs-mv2.xml', indexes: [0] })).status, 400);
    assert.equal((await sendJsonAsync('/files/specs-mv2.xml/move-entries', { targetName: 'specs-hidden.xml', indexes: [0] })).status, 400);
    assert.equal((await sendJsonAsync('/files/specs-mv2.xml/move-entries', { targetName: 'tasks-mv2.xml', indexes: [5] })).status, 409);
    assert.equal((await sendJsonAsync('/files/specs-mv2.xml/move-entries', { targetName: 'tasks-mv2.xml', indexes: [] })).status, 400);

    const loaded = await requestJsonAsync('/files/specs-mv2.xml');
    writeFileSync(path.join(cwd, 'specs-mv2.xml'), VALID_XML.replace('Alpha', 'Changed'));
    const stale = await sendJsonAsync('/files/specs-mv2.xml/move-entries', { targetName: 'tasks-mv2.xml', indexes: [0], baseFileHash: loaded.body.output.fileHash });
    assert.equal(stale.status, 409);
    // The stale-hash refusal left both files untouched (the source keeps the out-of-band change).
    assert.match((await requestJsonAsync('/files/specs-mv2.xml')).body.output.content, /Changed/);
});

test('move-entries refuses a target that is the same file under a different name (same inode), losing nothing', async function () {
    const single = [
        '<root>', '    <entries>',
        '        <entry type="spec"><title>solo-entry</title><content>Solo</content></entry>',
        '    </entries>', '</root>', ''
    ].join('\n');
    writeFileSync(path.join(cwd, 'specs-inode.xml'), single);
    // A second name resolving to the same on-disk file - the shape a case-insensitive filesystem produces. Both match
    // "specs*.xml", so both pass the name/include checks and only the inode comparison can catch this.
    symlinkSync(path.join(cwd, 'specs-inode.xml'), path.join(cwd, 'specs-inode-alias.xml'));

    const refused = await sendJsonAsync('/files/specs-inode.xml/move-entries', { targetName: 'specs-inode-alias.xml', indexes: [0] });
    assert.equal(refused.status, 400);
    // The entry is still there - the move never ran, so the "append then overwrite" data loss cannot happen.
    assert.match((await requestJsonAsync('/files/specs-inode.xml')).body.output.content, /solo-entry/);
});

test('move-entries creates the target file when it does not exist yet', async function () {
    writeFileSync(path.join(cwd, 'specs-split.xml'), [
        '<root>', '    <entries>',
        '        <entry type="spec"><title>alpha</title><content>A</content></entry>',
        '        <entry type="spec"><title>beta</title><content>B</content></entry>',
        '    </entries>', '</root>', ''
    ].join('\n'));
    // tasks-fresh.xml does not exist yet, but "tasks*.xml" includes it, so it can be created by the move.
    const moved = await sendJsonAsync('/files/specs-split.xml/move-entries', { targetName: 'tasks-fresh.xml', indexes: [0] });
    assert.equal(moved.status, 200);
    assert.equal(moved.body.output.createdTarget, true);

    const created = await requestJsonAsync('/files/tasks-fresh.xml');
    assert.equal(created.status, 200);
    assert.match(created.body.output.content, /<title>alpha<\/title>/); // the new file holds the moved entry
    assert.doesNotMatch((await requestJsonAsync('/files/specs-split.xml')).body.output.content, /<title>alpha<\/title>/);
});
