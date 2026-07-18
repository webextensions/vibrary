import assert from 'node:assert/strict';
import { test } from 'node:test';

import { repairCandidates } from './repairReference.ts';

const TITLES = ['oauth-token-refresh', 'session-timeout', 'rate-limiting', 'auth-token'];

test('a typo proposes the intended title first', function () {
    assert.equal(repairCandidates('oauth-token-refesh', TITLES)[0], 'oauth-token-refresh');
});

test('a hand-written unnormalized reference matches after normalization', function () {
    assert.equal(repairCandidates('Session Timeout', TITLES)[0], 'session-timeout');
});

test('a truncated reference matches by containment, ranked after edit-distance hits', function () {
    // 'auth-token' is one edit away (the near tier), 'oauth-token-refresh' contains the fragment (the partial tier);
    // the tier order is the contract - closer strings outrank longer containment matches.
    assert.deepEqual(repairCandidates('oauth-token', TITLES), ['auth-token', 'oauth-token-refresh']);
    // With no near-collision in the folder, containment alone recovers the truncated reference.
    assert.deepEqual(repairCandidates('oauth-token', ['oauth-token-refresh', 'session-timeout']), ['oauth-token-refresh']);
});

test('a genuinely absent target proposes nothing rather than the least-bad match', function () {
    // Nothing in the folder resembles this: a suggester that always suggests something cannot be trusted, and "no
    // candidates" is what tells the user that Remove is the correct action.
    assert.deepEqual(repairCandidates('legacy-login', TITLES), []);
});

test('tiny fragments never match by containment', function () {
    assert.deepEqual(repairCandidates('aut', ['authentication-flow']), []);
});

test('the candidate set is whatever titles are passed, so folder-wide indexes work unchanged', function () {
    // The caller passes the folder-wide title list (the card's takenTitles); a target in another file needs nothing
    // special here.
    assert.equal(repairCandidates('rate-limitin', ['rate-limiting'])[0], 'rate-limiting');
});
