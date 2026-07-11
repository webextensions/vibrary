import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isSortMode, SORT_OPTIONS } from './sortMode.ts';

// isSortMode guards the sort preference read back from localStorage: a real option must pass, anything else (a stale
// key from an older build, a hand-edited value, junk) must fall back so the caller can default to file order.
test('isSortMode accepts every real sort option and rejects anything else', function () {
    for (const option of SORT_OPTIONS) {
        assert.equal(isSortMode(option.value), true);
    }
    for (const notAMode of ['', 'bogus', 'File', 'recent', 'FILE', '__proto__']) {
        assert.equal(isSortMode(notAMode), false);
    }
});
