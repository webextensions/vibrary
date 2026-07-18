import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import { checkVibraryAsync } from './checkVibrary.js';
import { hashContent } from '../../shared/vibraryXmlCore.js';

// The rules behind `vibrary check`: the same broken-reference / duplicate-title / unparseable / approval-state
// judgments the UI shows as badges, collected as a problems list a CI step can fail on.

// An entry with an APPROVED hash matching its content (state 'current'), computed with the same helper the app uses.
const approvedEntry = function (title, content) {
    const approved = hashContent(content);
    return `<entry type="spec"><title>${title}</title><approved>${approved}</approved><content>${content}</content></entry>`;
};

const cwd = mkdtempSync(path.join(tmpdir(), 'vibrary-check-'));
writeFileSync(path.join(cwd, '.vibraryinclude'), 'specs*.xml\ntasks*.xml\n');
writeFileSync(path.join(cwd, 'specs.xml'), [
    '<root><entries>',
    // Approved and clean - the entry that must produce NO problem under any flag.
    `  ${approvedEntry('clean-one', 'All good.')}`,
    // Dangling reference: "ghost" is nobody's title.
    '  <entry type="spec"><title>refers-out</title><content>c</content><relatesTo><ref>ghost</ref><ref>clean-one</ref></relatesTo></entry>',
    // Stale approval: the approved hash does not match the current content.
    '  <entry type="spec"><title>went-stale</title><approved>0000000000</approved><content>changed since</content></entry>',
    '</entries></root>'
].join('\n'));
writeFileSync(path.join(cwd, 'tasks.xml'), [
    '<root><entries>',
    // Folder-wide duplicate of specs.xml's title.
    '  <entry type="task"><title>clean-one</title><content>duplicate holder</content></entry>',
    '</entries></root>'
].join('\n'));
writeFileSync(path.join(cwd, 'specs-broken.xml'), '<root><entries><entry></root>');

after(function () {
    rmSync(cwd, { recursive: true, force: true });
});

test('collects broken references, folder-wide duplicate titles, and unparseable files', async function () {
    const report = await checkVibraryAsync(cwd);
    assert.equal(report.configured, true);
    const kinds = report.problems.map(function (problem) { return problem.kind; }).toSorted(function (a, b) { return a.localeCompare(b); });
    assert.deepEqual(kinds, ['broken-reference', 'duplicate-title', 'unparseable']);
    const broken = report.problems.find(function (problem) { return problem.kind === 'broken-reference'; });
    assert.deepEqual(broken, { kind: 'broken-reference', file: 'specs.xml', title: 'refers-out', reference: 'ghost' });
    const duplicate = report.problems.find(function (problem) { return problem.kind === 'duplicate-title'; });
    assert.deepEqual(duplicate, { kind: 'duplicate-title', file: 'tasks.xml', title: 'clean-one', alsoIn: 'specs.xml' });
});

test('--require-approved is the only thing that surfaces unapproved and stale entries', async function () {
    const relaxed = await checkVibraryAsync(cwd);
    assert.ok(relaxed.problems.every(function (problem) { return problem.kind !== 'unapproved'; }));

    const strict = await checkVibraryAsync(cwd, { requireApproved: true });
    const unapproved = strict.problems.filter(function (problem) { return problem.kind === 'unapproved'; });
    // refers-out (never approved), went-stale (approval hash no longer matches), and tasks.xml's duplicate holder
    // (also never approved); specs.xml's approved clean-one stays green.
    assert.deepEqual(
        unapproved.map(function (problem) { return `${problem.title}:${problem.state}`; }).toSorted(function (a, b) { return a.localeCompare(b); }),
        ['clean-one:none', 'refers-out:none', 'went-stale:stale']
    );
});

test('reports per-file tallies matching the UI badges, null for an unparseable file', async function () {
    const report = await checkVibraryAsync(cwd);
    const byName = new Map(report.files.map(function (file) { return [file.name, file]; }));
    assert.deepEqual(byName.get('specs.xml'), { name: 'specs.xml', approved: 1, total: 3, brokenReferences: 1 });
    assert.deepEqual(byName.get('specs-broken.xml'), { name: 'specs-broken.xml', approved: null, total: null, brokenReferences: null });
});

test('a folder with no .vibraryinclude reports unconfigured, never trivially clean', async function () {
    const bare = mkdtempSync(path.join(tmpdir(), 'vibrary-check-bare-'));
    try {
        assert.deepEqual(await checkVibraryAsync(bare), { configured: false, files: [], problems: [] });
    } finally {
        rmSync(bare, { recursive: true, force: true });
    }
});
