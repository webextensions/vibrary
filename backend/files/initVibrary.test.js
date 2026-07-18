import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { initVibraryAsync } from './initVibrary.js';
import { VIBRARY_INCLUDE_TEMPLATE } from './files.js';
import { approvalState, parseVibraryXml } from '../../shared/vibraryXmlCore.js';

test('init scaffolds the include and a starter file that demonstrates the model', async function () {
    const cwd = mkdtempSync(path.join(tmpdir(), 'vibrary-init-'));
    try {
        const report = await initVibraryAsync(cwd);
        assert.deepEqual(report, { written: ['.vibraryinclude', 'specs.xml'], skipped: [] });

        // The include is the SAME constant the HTTP bootstrap route writes (imported, not copied) - byte for byte.
        assert.equal(readFileSync(path.join(cwd, '.vibraryinclude'), 'utf8'), VIBRARY_INCLUDE_TEMPLATE);

        // The starter parses with the shipped core and genuinely demonstrates what it claims: a current approval
        // (green badge, not a lie in the sample), and a relation that resolves to the other entry's exact title.
        const entries = parseVibraryXml(readFileSync(path.join(cwd, 'specs.xml'), 'utf8'));
        assert.equal(entries.length, 2);
        assert.equal(approvalState(entries[0]), 'current');
        assert.deepEqual(entries[1].relatesTo, [entries[0].title]);
        assert.ok(entries.every(function (entry) { return entry.labels.includes('getting-started'); }));
    } finally {
        rmSync(cwd, { recursive: true, force: true });
    }
});

test('init is create-only: a second run skips everything and changes nothing', async function () {
    const cwd = mkdtempSync(path.join(tmpdir(), 'vibrary-init-rerun-'));
    try {
        await initVibraryAsync(cwd);
        const before = readFileSync(path.join(cwd, 'specs.xml'), 'utf8');
        const rerun = await initVibraryAsync(cwd);
        assert.deepEqual(rerun, { written: [], skipped: ['.vibraryinclude', 'specs.xml'] });
        assert.equal(readFileSync(path.join(cwd, 'specs.xml'), 'utf8'), before);
    } finally {
        rmSync(cwd, { recursive: true, force: true });
    }
});

test('init reports each existing file individually and writes the rest', async function () {
    const cwd = mkdtempSync(path.join(tmpdir(), 'vibrary-init-partial-'));
    try {
        writeFileSync(path.join(cwd, '.vibraryinclude'), 'specs*.xml\n');
        const report = await initVibraryAsync(cwd);
        assert.deepEqual(report, { written: ['specs.xml'], skipped: ['.vibraryinclude'] });
        // The user's own narrower include is untouched.
        assert.equal(readFileSync(path.join(cwd, '.vibraryinclude'), 'utf8'), 'specs*.xml\n');
    } finally {
        rmSync(cwd, { recursive: true, force: true });
    }
});

test('--minimal writes only the include', async function () {
    const cwd = mkdtempSync(path.join(tmpdir(), 'vibrary-init-minimal-'));
    try {
        const report = await initVibraryAsync(cwd, { minimal: true });
        assert.deepEqual(report, { written: ['.vibraryinclude'], skipped: [] });
    } finally {
        rmSync(cwd, { recursive: true, force: true });
    }
});
