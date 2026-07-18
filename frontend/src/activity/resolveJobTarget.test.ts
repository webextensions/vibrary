import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveJobTarget } from './resolveJobTarget.ts';

const INDEX = [
    { title: 'oauth-token-refresh', path: 'specs.xml' },
    { title: 'oauth-token-refresh', path: 'specs-auth.xml' },
    { title: 'rate-limiting', path: 'tasks.xml' }
];

test('prefers the recorded file when the title still resolves there', function () {
    // Duplicate titles exist in two files; the run's own file must win over the folder's first occurrence.
    const resolved = resolveJobTarget(INDEX, { filePath: 'specs-auth.xml', entryTitle: 'oauth-token-refresh' });
    assert.deepEqual(resolved, { title: 'oauth-token-refresh', path: 'specs-auth.xml' });
});

test('follows an entry moved to another file by its title', function () {
    const resolved = resolveJobTarget(INDEX, { filePath: 'specs-old.xml', entryTitle: 'rate-limiting' });
    assert.deepEqual(resolved, { title: 'rate-limiting', path: 'tasks.xml' });
});

test('returns null when the title resolves nowhere (renamed or removed)', function () {
    assert.equal(resolveJobTarget(INDEX, { filePath: 'specs.xml', entryTitle: 'gone' }), null);
});
