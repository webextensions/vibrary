import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import { startAppAsync } from '../shared/testHelpers.js';

// Integration coverage for the settings router: the missing-file default, the PUT -> GET round trip (including
// where and how the file lands on disk), and the payload validation.

const cwd = mkdtempSync(path.join(tmpdir(), 'vibrary-settings-route-'));
const { server, requestJsonAsync, sendJsonAsync } = await startAppAsync(cwd);

after(function () {
    server.close();
    rmSync(cwd, { recursive: true, force: true });
});

test('GET /settings answers an empty object before anything was saved', async function () {
    const { status, body } = await requestJsonAsync('/settings');
    assert.equal(status, 200);
    assert.deepEqual(body.output, { settings: {} });
});

test('PUT /settings round-trips through GET and writes the .vibrary sidecar file', async function () {
    const settings = { notifications: { 'run-task': false }, taskOptions: {} };
    const saved = await sendJsonAsync('/settings', { settings }, 'PUT');
    assert.equal(saved.status, 200);

    const read = await requestJsonAsync('/settings');
    assert.deepEqual(read.body.output.settings, settings);

    // The on-disk location and shape are part of the contract: a machine-local, pretty-printed JSON file.
    const onDisk = readFileSync(path.join(cwd, '.vibrary', 'settings.local.json'), 'utf8');
    assert.deepEqual(JSON.parse(onDisk), settings);
    assert.ok(onDisk.endsWith('\n'), 'file ends with a newline');
});

test('PUT /settings rejects non-object payloads', async function () {
    assert.equal((await sendJsonAsync('/settings', { settings: [] }, 'PUT')).status, 400);
    assert.equal((await sendJsonAsync('/settings', { settings: null }, 'PUT')).status, 400);
    assert.equal((await sendJsonAsync('/settings', {}, 'PUT')).status, 400);
});
