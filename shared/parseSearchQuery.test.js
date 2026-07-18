import assert from 'node:assert/strict';
import test from 'node:test';

import { parseSearchQuery } from './parseSearchQuery.js';

test('splits known field:value tokens into constraints and keeps the rest as the needle', function () {
    const { needle, constraints } = parseSearchQuery('type:spec approved:no oauth refresh');
    assert.equal(needle, 'oauth refresh');
    assert.deepEqual(constraints, [
        { field: 'type', value: 'spec', negated: false },
        { field: 'approved', value: 'no', negated: false }
    ]);
});

test('a colon in ordinary prose and an unknown field both stay in the needle', function () {
    assert.deepEqual(parseSearchQuery('note: check this'), { needle: 'note: check this', constraints: [] });
    // A mistyped operator visibly does not become a filter - the honest behaviour.
    assert.deepEqual(parseSearchQuery('typo:spec').constraints, []);
    assert.equal(parseSearchQuery('typo:spec').needle, 'typo:spec');
});

test('a "-" prefix negates a constraint; a bare "-" word stays needle text', function () {
    assert.deepEqual(parseSearchQuery('-type:idea').constraints, [{ field: 'type', value: 'idea', negated: true }]);
    assert.equal(parseSearchQuery('well - dashed').needle, 'well - dashed');
});

test('a value keeps everything after the first colon, raw', function () {
    assert.deepEqual(parseSearchQuery('label:has:colon').constraints, [{ field: 'label', value: 'has:colon', negated: false }]);
    // Raw on purpose: file: values are globs where case matters; consumers case-fold per field.
    assert.deepEqual(parseSearchQuery('file:Specs*.xml').constraints, [{ field: 'file', value: 'Specs*.xml', negated: false }]);
});

test('a field with an empty value is not a constraint', function () {
    assert.deepEqual(parseSearchQuery('type:'), { needle: 'type:', constraints: [] });
});
