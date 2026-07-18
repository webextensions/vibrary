import assert from 'node:assert/strict';
import test from 'node:test';

import type { Job } from './activityQueue.ts';
import { formatDuration, jobElapsed } from './formatDuration.ts';

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

// jobElapsed encodes which queue timestamps are meaningful in which status; pin all four states so both consumers
// (monitor row, detail header) inherit the same behavior.

const jobWith = function (patch: Partial<Job>): Job {
    return { id: 'j1', kind: 'run-task', label: 'x', status: 'queued', startedAt: null, endedAt: null, error: null, ...patch } as Job;
};

test('jobElapsed is null before the job ever started', function () {
    assert.equal(jobElapsed(jobWith({}), 10_000), null);
});

test('jobElapsed ticks live against now while running', function () {
    assert.equal(jobElapsed(jobWith({ status: 'running', startedAt: 1000 }), 66_000), '1:05');
});

test('jobElapsed is final once finished', function () {
    assert.equal(jobElapsed(jobWith({ status: 'success', startedAt: 1000, endedAt: 31_000 }), 999_000), '0:30');
});

test('jobElapsed falls back to now for a re-queued chat turn (finished status gone, endedAt null)', function () {
    assert.equal(jobElapsed(jobWith({ status: 'queued', startedAt: 1000, endedAt: null }), 61_000), '1:00');
});
