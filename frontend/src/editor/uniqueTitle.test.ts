import assert from 'node:assert/strict';
import test from 'node:test';

import { uniqueTitle } from './uniqueTitle.ts';

test('uniqueTitle appends the first free -N suffix, skipping taken ones', function () {
    // The colliding title is in `existing` (it appears 2+ times), so the base itself is always "taken".
    assert.equal(uniqueTitle('login-flow', ['login-flow', 'login-flow']), 'login-flow-2');
    assert.equal(uniqueTitle('login-flow', ['login-flow', 'login-flow-2']), 'login-flow-3');
    assert.equal(uniqueTitle('login-flow', ['login-flow', 'login-flow-2', 'login-flow-3']), 'login-flow-4');
});

test('uniqueTitle returns the base unchanged when it is not taken', function () {
    assert.equal(uniqueTitle('unique-one', ['other']), 'unique-one');
});
