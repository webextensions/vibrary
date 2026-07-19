import assert from 'node:assert/strict';
import test from 'node:test';

import { type Job } from './activityQueue.ts';
import { earliestDeferredWake, isDeferred, selectRunnableJob } from './queueScheduling.ts';

// The deferral arithmetic behind the queue pump: "start no earlier than" means later jobs overtake a deferred one,
// and the earliest maturity is the pump's wake-up alarm.

const job = function (id: string, status: Job['status'], runAfter: number | null): Job {
    return { id, kind: 'run-task', label: id, status, startedAt: null, endedAt: null, error: null, prompt: null, sessionId: null, target: null, runAfter, run: function () { return Promise.resolve(''); } };
};

test('a deferred head job is skipped and the job behind it runs', function () {
    const jobs = [job('deferred', 'queued', 10000), job('ready', 'queued', null)];
    assert.equal(selectRunnableJob(jobs, 5000)?.id, 'ready');
    // Once the deferral matures, queue order rules again.
    assert.equal(selectRunnableJob(jobs, 10000)?.id, 'deferred');
});

test('deferral only applies to queued jobs and never selects running or finished ones', function () {
    assert.equal(isDeferred(job('r', 'running', 10000), 0), false);
    const jobs = [job('done', 'success', null), job('r', 'running', null)];
    assert.equal(selectRunnableJob(jobs, 0), null);
});

test('the wake alarm is the earliest deferred maturity, or null with nothing deferred', function () {
    const jobs = [job('a', 'queued', 9000), job('b', 'queued', 7000), job('c', 'queued', null)];
    assert.equal(earliestDeferredWake(jobs, 5000), 7000);
    // A matured deferral no longer needs an alarm.
    assert.equal(earliestDeferredWake(jobs, 9500), null);
    assert.equal(earliestDeferredWake([job('c', 'queued', null)], 0), null);
});
