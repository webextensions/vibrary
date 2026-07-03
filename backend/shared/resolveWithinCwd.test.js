import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { resolveWithinCwd } from './resolveWithinCwd.js';

// This is the shared defense-in-depth guard every file and git route runs before touching the filesystem. Pin its
// containment semantics - especially the "root + path.sep" boundary, without which a sibling folder sharing the cwd's
// name as a prefix (e.g. "/srv/app" vs "/srv/app-evil") would pass a plain startsWith check.

// A platform-neutral absolute base to resolve against; the guard never touches the filesystem, so it need not exist.
const ROOT = path.resolve(path.sep, 'srv', 'vibrary');

test('resolveWithinCwd resolves names inside the folder to absolute paths', function () {
    assert.equal(resolveWithinCwd(ROOT, 'specs.xml'), path.join(ROOT, 'specs.xml'));
    assert.equal(resolveWithinCwd(ROOT, 'docs/api/reviews.xml'), path.join(ROOT, 'docs', 'api', 'reviews.xml'));
    // "." and "" resolve to the folder itself, which is inside by definition.
    assert.equal(resolveWithinCwd(ROOT, '.'), ROOT);
    assert.equal(resolveWithinCwd(ROOT, ''), ROOT);
});

test('resolveWithinCwd normalizes redundant segments before judging containment', function () {
    // Traversal that stays inside is allowed - the guard cares about the destination, not the route taken.
    assert.equal(resolveWithinCwd(ROOT, 'docs/../specs.xml'), path.join(ROOT, 'specs.xml'));
    assert.equal(resolveWithinCwd(ROOT, './specs.xml'), path.join(ROOT, 'specs.xml'));
});

test('resolveWithinCwd returns null for destinations outside the folder', function () {
    assert.equal(resolveWithinCwd(ROOT, '..'), null);
    assert.equal(resolveWithinCwd(ROOT, '../specs.xml'), null);
    assert.equal(resolveWithinCwd(ROOT, 'docs/../../specs.xml'), null);
    assert.equal(resolveWithinCwd(ROOT, path.resolve(path.sep, 'etc', 'passwd')), null);
});

test('resolveWithinCwd rejects siblings sharing the folder name as a prefix', function () {
    // path.resolve(ROOT, '../vibrary-evil/x') starts with the ROOT string but lives outside the folder - only the
    // trailing-separator check catches it.
    assert.equal(resolveWithinCwd(ROOT, `../${path.basename(ROOT)}-evil/specs.xml`), null);
});
