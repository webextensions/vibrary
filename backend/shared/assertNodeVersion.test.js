import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isVersionBelow } from './assertNodeVersion.js';

// Numeric segment-by-segment comparison, the part that would be wrong under a naive string compare (where "9" > "22").

test('isVersionBelow compares versions numerically, not lexically', function () {
    assert.equal(isVersionBelow('v22.17.9', '22.18.0'), true);
    assert.equal(isVersionBelow('v20.19.0', '22.18.0'), true);
    assert.equal(isVersionBelow('v9.99.99', '22.18.0'), true, 'single-digit major is not "greater" than 22');

    assert.equal(isVersionBelow('v22.18.0', '22.18.0'), false, 'exactly the floor is supported');
    assert.equal(isVersionBelow('v22.18.1', '22.18.0'), false);
    assert.equal(isVersionBelow('v22.19.0', '22.18.0'), false);
    assert.equal(isVersionBelow('v24.0.0', '22.18.0'), false);
});
