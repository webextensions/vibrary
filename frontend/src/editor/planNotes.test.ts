import assert from 'node:assert/strict';
import test from 'node:test';

import { hasPlan, PLAN_HEADING, withPlan } from './planNotes.ts';

// The plan-notes contract: hand-written notes survive every redraft, stale plans never stack, and detection drives
// the Apply button's "with plan" label.

test('a plan lands under the heading, alone in empty notes and after existing notes otherwise', function () {
    assert.equal(withPlan('', 'Step one.\nStep two.'), `${PLAN_HEADING}\n\nStep one.\nStep two.`);
    assert.equal(withPlan('Keep this note.', 'The plan.'), `Keep this note.\n\n${PLAN_HEADING}\n\nThe plan.`);
});

test('re-planning replaces the old plan and keeps the notes above it', function () {
    const first = withPlan('Context worth keeping.', 'Old plan.');
    const second = withPlan(first, 'New plan.');
    assert.equal(second, `Context worth keeping.\n\n${PLAN_HEADING}\n\nNew plan.`);
    assert.doesNotMatch(second, /Old plan/);
});

test('hasPlan detects exactly the heading', function () {
    assert.equal(hasPlan(''), false);
    assert.equal(hasPlan('notes without a plan'), false);
    assert.equal(hasPlan(withPlan('', 'x')), true);
});
