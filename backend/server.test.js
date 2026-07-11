import assert from 'node:assert/strict';
import { test } from 'node:test';

import { lanUrlsForHost } from './server.js';

// Unit coverage for the startup line's LAN-URL helper: a wildcard bind must advertise the machine's real IPv4
// addresses (the phone-on-the-LAN case), while a specific bind advertises nothing extra and internal/IPv6 addresses
// are never offered. A fixed networkInterfaces() fixture keeps this deterministic across machines.

const INTERFACES = {
    lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
    eth0: [
        { address: '192.168.1.20', family: 'IPv4', internal: false },
        { address: 'fe80::1', family: 'IPv6', internal: false }
    ],
    docker0: [{ address: '172.17.0.1', family: 'IPv4', internal: false }]
};

test('a wildcard bind lists every external IPv4 URL, skipping internal and IPv6 addresses', function () {
    assert.deepEqual(
        lanUrlsForHost('0.0.0.0', 3000, INTERFACES),
        ['http://192.168.1.20:3000/', 'http://172.17.0.1:3000/']
    );
    assert.deepEqual(lanUrlsForHost('::', 8080, INTERFACES), ['http://192.168.1.20:8080/', 'http://172.17.0.1:8080/']);
});

test('a specific bind advertises no extra URLs (the printed host URL already suffices)', function () {
    assert.deepEqual(lanUrlsForHost('127.0.0.1', 3000, INTERFACES), []);
    assert.deepEqual(lanUrlsForHost('192.168.1.20', 3000, INTERFACES), []);
});

test('a wildcard bind with no external IPv4 address yields an empty list', function () {
    assert.deepEqual(lanUrlsForHost('0.0.0.0', 3000, { lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }] }), []);
});
