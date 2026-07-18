import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, test } from 'node:test';

import { startAppAsync } from '../shared/testHelpers.js';

// Integration coverage for the docs router: the shipped manual is served from the PACKAGE's docs/ directory, never
// from the served folder - the cwd here deliberately contains a decoy file named like a doc to prove it.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const cwd = mkdtempSync(path.join(tmpdir(), 'vibrary-docs-route-'));
writeFileSync(path.join(cwd, '.vibraryinclude'), 'specs*.xml\n');
// The decoy: if the route ever resolved against cwd, this is what it would wrongly serve.
writeFileSync(path.join(cwd, 'editor.md'), 'DECOY - this must never be served\n');

const { server, requestJsonAsync } = await startAppAsync(cwd);

after(function () {
    server.close();
    rmSync(cwd, { recursive: true, force: true });
});

test('serves each allowlisted manual page from the package, not the served folder', async function () {
    for (const name of ['README.md', 'editor.md', 'vibrary-file-format.md']) {
        const { status, body } = await requestJsonAsync(`/docs/${name}`);
        assert.equal(status, 200);
        assert.equal(body.output.content, readFileSync(path.join(repoRoot, 'docs', name), 'utf8'));
    }
});

test('anything outside the allowlist is a 404, including path-shaped names', async function () {
    for (const name of ['nope.md', 'specs%2Ftooling%2Fci-github-actions.md', '..%2Fpackage.json', '.vibraryinclude']) {
        const { status, body } = await requestJsonAsync(`/docs/${name}`);
        assert.equal(status, 404);
        assert.equal(body.status, 'error');
    }
});
