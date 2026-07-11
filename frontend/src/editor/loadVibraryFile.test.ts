import assert from 'node:assert/strict';
import test from 'node:test';

import { directoryOf, parseSchemaReference } from './loadVibraryFile.ts';

// The two path helpers behind option-form schema resolution: parseSchemaReference splits an entry's "<file>#<id>"
// formSchemaRef, and directoryOf resolves the sibling schemas file against the entry file's own folder. A bug here
// silently loads the wrong form (or none), so pin the shapes and the malformed-ref guards.

test('parseSchemaReference splits a well-formed "<file>#<id>" reference', function () {
    assert.deepEqual(parseSchemaReference('tasks.xml.schemas.json#deploy-options'), { file: 'tasks.xml.schemas.json', id: 'deploy-options' });
});

test('parseSchemaReference returns null when either side is missing', function () {
    assert.equal(parseSchemaReference('no-hash-here'), null);
    assert.equal(parseSchemaReference('#only-id'), null, 'empty file side');
    assert.equal(parseSchemaReference('only-file#'), null, 'empty id side');
    assert.equal(parseSchemaReference(''), null);
});

test('directoryOf returns the folder, or empty for a top-level file', function () {
    assert.equal(directoryOf('docs/tasks/tasks.xml'), 'docs/tasks');
    assert.equal(directoryOf('specs.xml'), '');
});
