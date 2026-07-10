import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import { startAppAsync } from './testHelpers.js';

// Integration coverage for the cross-site guard in front of /api: foreign Origins and name-based Hosts (the CSRF and
// DNS-rebinding vectors) must be rejected, while the legitimate shapes - no Origin at all (curl, same-origin GETs),
// a matching Origin, localhost, and raw IP Hosts (the phone-on-the-LAN flow) - keep working. Raw node:http requests
// are used because fetch refuses to send forged Host/Origin headers.

const cwd = mkdtempSync(path.join(tmpdir(), 'vibrary-cross-site-'));
const { server, requestJsonAsync } = await startAppAsync(cwd);
const { port } = server.address();

after(function () {
    server.close();
    rmSync(cwd, { recursive: true, force: true });
});

const requestWithHeadersAsync = function (headers) {
    return new Promise(function (resolve, reject) {
        const request = http.request(
            { host: '127.0.0.1', port, path: '/api/settings', setHost: false, headers },
            function (response) {
                let raw = '';
                response.on('data', function (chunk) {
                    raw += chunk;
                });
                response.on('end', function () {
                    resolve({ status: response.statusCode, body: /** @type {any} */ (JSON.parse(raw)) });
                });
            }
        );
        request.on('error', reject);
        request.end();
    });
};

test('requests without an Origin header pass through', async function () {
    const { status } = await requestJsonAsync('/settings');
    assert.equal(status, 200);
});

test('a matching Origin passes through', async function () {
    const { status } = await requestWithHeadersAsync({
        Host: `127.0.0.1:${port}`,
        Origin: `http://127.0.0.1:${port}`
    });
    assert.equal(status, 200);
});

test('a foreign Origin is rejected before any router runs', async function () {
    const { status, body } = await requestWithHeadersAsync({
        Host: `127.0.0.1:${port}`,
        Origin: 'https://evil.example'
    });
    assert.equal(status, 403);
    assert.equal(body.status, 'error');
    assert.match(body.errorMessage, /cross-origin/);
});

test('an opaque "null" Origin is rejected', async function () {
    const { status } = await requestWithHeadersAsync({
        Host: `127.0.0.1:${port}`,
        Origin: 'null'
    });
    assert.equal(status, 403);
});

test('a name-based Host header is rejected (DNS rebinding)', async function () {
    const { status, body } = await requestWithHeadersAsync({ Host: `evil.example:${port}` });
    assert.equal(status, 403);
    assert.match(body.errorMessage, /Host header/);
});

test('localhost and IP-literal Hosts are accepted', async function () {
    assert.equal((await requestWithHeadersAsync({ Host: `localhost:${port}` })).status, 200);
    assert.equal((await requestWithHeadersAsync({ Host: `[::1]:${port}` })).status, 200);
    assert.equal((await requestWithHeadersAsync({ Host: `192.168.1.20:${port}` })).status, 200);
});
