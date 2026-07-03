import assert from 'node:assert/strict';
import test from 'node:test';

import { optionsToPrompt, schemaDefaults } from './taskOptions.ts';

// optionsToPrompt's exact "- <title>: <value>" rendering is a cross-module contract: the backend's
// isRalphLoopSelected (runClaudeRunTask.js) regex-matches the "- Use Ralph loop...: yes" line to arm the Ralph-loop
// prompt block, so a drift in this format would silently disable that opt-in. schemaDefaults and the cleared-value
// fallback also encode rjsf quirks (cleared multi-selects report [] and cleared text '', never undefined) that a
// refactor could easily reintroduce.

const SCHEMA = {
    properties: {
        useRalphLoop: { type: 'boolean', title: 'Use Ralph loop', default: false },
        focusAreas: { type: 'array', title: 'Focus areas', items: { type: 'string' } },
        extraNote: { type: 'string', title: 'Extra note' },
        untitled: { type: 'string' }
    }
} as const;

test('schemaDefaults picks only the properties that declare a default', function () {
    assert.deepEqual(schemaDefaults(SCHEMA), { useRalphLoop: false });
    assert.deepEqual(schemaDefaults({ properties: {} }), {});
});

test('optionsToPrompt renders booleans as yes/no with the exact "- Title: value" shape', function () {
    assert.equal(
        optionsToPrompt(SCHEMA, { useRalphLoop: true }),
        '- Use Ralph loop: yes'
    );
    // The backend's Ralph opt-in detection depends on this exact line shape.
    assert.match(optionsToPrompt(SCHEMA, { useRalphLoop: true }), /^- Use Ralph loop\b.*: yes$/m);
    assert.equal(optionsToPrompt(SCHEMA, { useRalphLoop: false }), '- Use Ralph loop: no');
});

test('optionsToPrompt joins arrays, prints strings, and labels untitled properties by key', function () {
    assert.equal(
        optionsToPrompt(SCHEMA, { useRalphLoop: true, focusAreas: ['backend', 'docs'], extraNote: 'be brief', untitled: 'x' }),
        ['- Use Ralph loop: yes', '- Focus areas: backend, docs', '- Extra note: be brief', '- untitled: x'].join('\n')
    );
});

test('optionsToPrompt falls back to the schema default for cleared values and drops still-empty lines', function () {
    // rjsf reports a cleared multi-select as [] and cleared text as '' (never undefined); both must fall back to the
    // default, and a line whose value is still empty after the fallback is dropped rather than rendered dangling.
    assert.equal(
        optionsToPrompt(SCHEMA, { useRalphLoop: undefined, focusAreas: [], extraNote: '' }),
        '- Use Ralph loop: no'
    );
    assert.equal(optionsToPrompt({ properties: {} }, {}), '');
});
