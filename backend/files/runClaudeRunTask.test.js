import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isRalphLoopSelected } from './runClaudeRunTask.js';

// The Ralph-loop opt-in is armed by regex-matching the "- Use Ralph loop: yes" line that the frontend's optionsToPrompt
// renders (taskOptions.ts). This is a documented cross-module contract - the frontend test (taskOptions.test.ts) pins
// the line shape it produces; this pins the BACKEND half, so a stray edit to the detection regex can't silently disable
// the opt-in without a test noticing.

test('matches the "yes" line within a rendered options block', function () {
    const block = ['- Use Ralph loop: yes', '- Focus areas: backend, docs', '- Extra note: be brief'].join('\n');
    assert.equal(isRalphLoopSelected(block), true);
    // Position within the block does not matter (the regex is multiline-anchored).
    assert.equal(isRalphLoopSelected(['- Focus areas: docs', '- Use Ralph loop: yes'].join('\n')), true);
});

test('is false for the "no" line, an absent option, and an empty block', function () {
    assert.equal(isRalphLoopSelected('- Use Ralph loop: no\n- Focus areas: docs'), false);
    assert.equal(isRalphLoopSelected('- Focus areas: docs'), false);
    assert.equal(isRalphLoopSelected(''), false);
});

test('only the rendered option line arms it, not a prose mention', function () {
    assert.equal(isRalphLoopSelected('The task says to use Ralph loop: yes it should'), false);
});
