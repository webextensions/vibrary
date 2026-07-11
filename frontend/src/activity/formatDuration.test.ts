import assert from 'node:assert/strict';
import test from 'node:test';

import { formatDuration } from './formatDuration.ts';

// formatDuration renders the mm:ss shown on every activity row and the detail tab's elapsed timer, so pin its edges:
// sub-second and negative spans clamp to 0:00, seconds are zero-padded and floored, and minutes roll over past 60.

test('formatDuration renders mm:ss with padded, floored seconds', function () {
    assert.equal(formatDuration(0), '0:00');
    assert.equal(formatDuration(5999), '0:05', 'sub-second remainder is floored, not rounded');
    assert.equal(formatDuration(65_000), '1:05');
    assert.equal(formatDuration(3_600_000), '60:00', 'minutes are not wrapped at 60');
});

test('formatDuration clamps a negative span to 0:00', function () {
    assert.equal(formatDuration(-500), '0:00');
});
