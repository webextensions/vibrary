import assert from 'node:assert/strict';
import { test } from 'node:test';

import { labelOptions } from './labelOptions.ts';

test('merges the saved folder vocabulary with the live file labels, sorted and unique', function () {
    const result = labelOptions(['backend', 'auth'], [{ labels: ['auth', 'v2'] }, { labels: [] }]);
    assert.deepEqual(result, ['auth', 'backend', 'v2']);
});

test('a label typed into one live entry is offered even before a save', function () {
    assert.deepEqual(labelOptions([], [{ labels: ['fresh'] }]), ['fresh']);
});

test('empty labels never become a suggestion', function () {
    assert.deepEqual(labelOptions([''], [{ labels: [''] }]), []);
});
