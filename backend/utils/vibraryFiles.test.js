import assert from 'node:assert/strict';
import test from 'node:test';

import { isValidSchemasName, isValidVibraryName } from './vibraryFiles.js';

// These validators are the first line of every file route's path-traversal defense, and they encode non-obvious
// edge cases: SEGMENT_REGEX alone would match ".." (dots are in its character class), so only the explicit
// segment checks make a nested name traversal-safe. Pin the accepted and rejected shapes so a future "harmless"
// regex tweak cannot silently widen what reaches the filesystem.

const VALID_VIBRARY_NAMES = [
    'reviews.xml',
    'specs.xml',
    'tasks.xml',
    'ideas.xml',
    'specs-auth.xml',
    'reviews-2026.q1.xml',
    'tasks-with_underscore.xml',
    'docs/specs.xml',
    'docs/api/reviews-auth.xml'
];

const INVALID_VIBRARY_NAMES = [
    // traversal and separator tricks
    '../specs.xml',
    'docs/../specs.xml',
    './specs.xml',
    'docs/./specs.xml',
    '/etc/specs.xml',
    String.raw`docs\..\reviews.xml`,
    // wrong family, extension, or shape
    'notes.xml',
    'specs.json',
    'specs.xml.bak',
    'specs',
    'prefix-specs.xml',
    'docs/specs.xml/',
    // empty or non-string
    '',
    ' '.repeat(3)
];

test('isValidVibraryName accepts flat, nested, and suffixed vibrary names', function () {
    for (const name of VALID_VIBRARY_NAMES) {
        assert.equal(isValidVibraryName(name), true, `expected valid: ${JSON.stringify(name)}`);
    }
});

test('isValidVibraryName rejects traversal, separators, wrong families, and junk', function () {
    for (const name of INVALID_VIBRARY_NAMES) {
        assert.equal(isValidVibraryName(name), false, `expected invalid: ${JSON.stringify(name)}`);
    }
    assert.equal(isValidVibraryName(undefined), false);
    assert.equal(isValidVibraryName(null), false);
    assert.equal(isValidVibraryName(42), false);
});

test('isValidSchemasName accepts only "<vibrary>.xml.schemas.json" shapes, with safe segments', function () {
    assert.equal(isValidSchemasName('tasks.xml.schemas.json'), true);
    assert.equal(isValidSchemasName('docs/tasks/tasks.xml.schemas.json'), true);
    assert.equal(isValidSchemasName('specs-auth.xml.schemas.json'), true);

    assert.equal(isValidSchemasName('tasks.xml'), false);
    assert.equal(isValidSchemasName('tasks.schemas.json'), false);
    assert.equal(isValidSchemasName('notes.xml.schemas.json'), false);
    assert.equal(isValidSchemasName('../tasks.xml.schemas.json'), false);
    assert.equal(isValidSchemasName('docs/../tasks.xml.schemas.json'), false);
    assert.equal(isValidSchemasName(''), false);
    assert.equal(isValidSchemasName(undefined), false);
});
