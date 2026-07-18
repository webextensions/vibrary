import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildCompetitionPrompt, parseVerdict } from './runClaudeCompetition.js';

// The judge's two mechanical contracts: the prompt carries both contenders (and the optional guidance) verbatim, and
// the verdict parser is lenient about JSON wrapped in prose but strict about the winner being a real contender.

const first = { title: 'idea-a', content: 'Ship the thing.', notes: 'cheap' };
const second = { title: 'idea-b', content: 'Polish the thing.', notes: '' };

test('the prompt names both contenders, their content and notes, and the exact-title rule', function () {
    const prompt = buildCompetitionPrompt({ first, second, instructions: '' });
    assert.match(prompt, /Entry A - "idea-a":\nShip the thing\.\nNotes: cheap/);
    assert.match(prompt, /Entry B - "idea-b":\nPolish the thing\./);
    assert.match(prompt, /exactly "idea-a" or "idea-b"/);
    assert.doesNotMatch(prompt, /guidance from the user/);
});

test('user guidance is folded in only when provided', function () {
    const prompt = buildCompetitionPrompt({ first, second, instructions: 'favor quick wins' });
    assert.match(prompt, /guidance from the user:\nfavor quick wins/);
});

test('parseVerdict accepts a bare object, prose padding, and code fences', function () {
    const titles = ['idea-a', 'idea-b'];
    const expected = { winner: 'idea-b', rationale: 'more leverage' };
    assert.deepEqual(parseVerdict('{"winner":"idea-b","rationale":"more leverage"}', titles), expected);
    assert.deepEqual(parseVerdict('Sure! Here is my verdict:\n{"winner":"idea-b","rationale":"more leverage"}\nDone.', titles), expected);
    assert.deepEqual(parseVerdict('```json\n{"winner":"idea-b","rationale":"more leverage"}\n```', titles), expected);
});

test('parseVerdict defaults a missing rationale to empty text', function () {
    assert.deepEqual(parseVerdict('{"winner":"idea-a"}', ['idea-a', 'idea-b']), { winner: 'idea-a', rationale: '' });
});

test('parseVerdict rejects no JSON, broken JSON, and a winner that is neither contender', function () {
    const titles = ['idea-a', 'idea-b'];
    assert.throws(function () { parseVerdict('I cannot decide.', titles); }, /did not answer with a JSON verdict/);
    assert.throws(function () { parseVerdict('{"winner": idea-a}', titles); }, /not valid JSON/);
    assert.throws(function () { parseVerdict('{"winner":"idea-c","rationale":"x"}', titles); }, /"idea-c", which is neither contender/);
});

test('a custom template substitutes its placeholders and still gets the verdict demand appended', function () {
    const prompt = buildCompetitionPrompt({
        first,
        second,
        instructions: 'favor quick wins',
        template: 'Pick the better bet.\n{{entryA}}\nversus\n{{entryB}}\nGuidance: {{instructions}}'
    });
    assert.match(prompt, /^Pick the better bet\./);
    assert.match(prompt, /Entry A - "idea-a":\nShip the thing\./);
    assert.match(prompt, /versus\nEntry B - "idea-b":/);
    assert.match(prompt, /Guidance: favor quick wins/);
    // The parseable-verdict contract is appended even though the template never asked for it.
    assert.match(prompt, /exactly "idea-a" or "idea-b"/);
    assert.match(prompt, /Respond with ONLY one JSON object/);
    // And the built-in framing is gone - the template replaced it.
    assert.doesNotMatch(prompt, /head-to-head competition/);
});

test('a blank template falls back to the built-in prompt', function () {
    const templated = buildCompetitionPrompt({ first, second, instructions: '', template: '  \n' });
    const builtIn = buildCompetitionPrompt({ first, second, instructions: '' });
    assert.equal(templated, builtIn);
});
