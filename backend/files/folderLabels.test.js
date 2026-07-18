import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import { collectFolderLabelsAsync } from './folderLabels.js';

// The folder-wide label vocabulary behind the generate prompt's "reuse these labels" hint: sorted, unique, tolerant
// of broken files, and byte-bounded (it lands on the argv the MAX_PROMPT_BYTES guard does not measure).

const entryXml = function (title, labels) {
    const labelXml = labels.map(function (label) { return `<label>${label}</label>`; }).join('');
    return `<entry type="spec"><title>${title}</title><content>c</content><labels>${labelXml}</labels></entry>`;
};

const cwd = mkdtempSync(path.join(tmpdir(), 'vibrary-folder-labels-'));
writeFileSync(path.join(cwd, '.vibraryinclude'), 'specs*.xml\n');
writeFileSync(path.join(cwd, 'specs.xml'), `<root><entries>${entryXml('one', ['backend', 'auth'])}${entryXml('two', ['auth'])}</entries></root>`);
writeFileSync(path.join(cwd, 'specs-more.xml'), `<root><entries>${entryXml('three', ['v2', 'auth'])}</entries></root>`);
writeFileSync(path.join(cwd, 'specs-broken.xml'), '<root><entries><entry></root>');

after(function () {
    rmSync(cwd, { recursive: true, force: true });
});

test('collects every included file\'s labels, sorted and deduplicated, skipping unparseable files', async function () {
    assert.deepEqual(await collectFolderLabelsAsync(cwd), ['auth', 'backend', 'v2']);
});

test('bounds the vocabulary by bytes rather than growing the prompt without limit', async function () {
    const bounded = mkdtempSync(path.join(tmpdir(), 'vibrary-folder-labels-cap-'));
    writeFileSync(path.join(bounded, '.vibraryinclude'), 'specs*.xml\n');
    // 'aa' sorts before the oversized label, which alone blows the 4 KiB budget and is dropped with everything after.
    writeFileSync(path.join(bounded, 'specs.xml'), `<root><entries>${entryXml('one', ['aa', 'b'.repeat(5000)])}</entries></root>`);
    try {
        assert.deepEqual(await collectFolderLabelsAsync(bounded), ['aa']);
    } finally {
        rmSync(bounded, { recursive: true, force: true });
    }
});
