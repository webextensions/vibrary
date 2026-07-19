import assert from 'node:assert/strict';
import test from 'node:test';

import { describeOversize, OVERSIZE_BULLET_THRESHOLD, OVERSIZE_CHARACTER_THRESHOLD } from './specSizing.ts';

// The scoping hint's contract: generous thresholds, spec/task only, and a message naming what tripped it.

test('an ordinary spec draws no hint', function () {
    assert.equal(describeOversize({ type: 'spec', content: 'Do one focused thing.\n- step one\n- step two' }), null);
});

test('review and idea entries never draw the hint, however large', function () {
    const huge = 'x'.repeat(OVERSIZE_CHARACTER_THRESHOLD * 2);
    assert.equal(describeOversize({ type: 'review', content: huge }), null);
    assert.equal(describeOversize({ type: 'idea', content: huge }), null);
});

test('length past the threshold trips the hint and names the size', function () {
    const hint = describeOversize({ type: 'spec', content: 'y'.repeat(OVERSIZE_CHARACTER_THRESHOLD + 1) });
    assert.match(hint ?? '', /Large spec/);
    assert.match(hint ?? '', /characters/);
    assert.match(hint ?? '', /consider splitting/);
});

test('too many bullets trip the hint even in short content, counting -, *, + and numbered markers', function () {
    const bullets = ['- a', '* b', '+ c', '1. d', '2) e', '- f', '- g', '- h', '- i', '- j', '- k'];
    assert.equal(bullets.length, OVERSIZE_BULLET_THRESHOLD + 1);
    const hint = describeOversize({ type: 'task', content: bullets.join('\n') });
    assert.match(hint ?? '', /Large task \(11 bullet points\)/);
});

test('exactly at the thresholds stays quiet', function () {
    const atLength = describeOversize({ type: 'spec', content: 'z'.repeat(OVERSIZE_CHARACTER_THRESHOLD) });
    assert.equal(atLength, null);
    const atBullets = describeOversize({ type: 'spec', content: Array.from({ length: OVERSIZE_BULLET_THRESHOLD }, function (_unused, index) { return `- item ${index}`; }).join('\n') });
    assert.equal(atBullets, null);
});
