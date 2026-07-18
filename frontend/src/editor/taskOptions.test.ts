import assert from 'node:assert/strict';
import test from 'node:test';

import { isRalphLoopEnabled, optionsToPrompt, schemaDefaults } from './taskOptions.ts';

// isRalphLoopEnabled is the control channel for the backend's Ralph-loop behavior (a structured flag keyed on the
// schema property KEY, sent through the /run-task body), so its key-detection and default fallback are pinned here.
// schemaDefaults and the cleared-value fallback also encode rjsf quirks (cleared multi-selects report [] and cleared
// text '', never undefined) that a refactor could easily reintroduce.

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
    assert.equal(optionsToPrompt(SCHEMA, { useRalphLoop: false }), '- Use Ralph loop: no');
});

test('isRalphLoopEnabled keys on the useRalphLoop property, not its display title', function () {
    assert.equal(isRalphLoopEnabled(SCHEMA, { useRalphLoop: true }), true);
    assert.equal(isRalphLoopEnabled(SCHEMA, { useRalphLoop: false }), false);
    // A retitled (or translated) property still works - the KEY is the contract.
    const retitled = { properties: { useRalphLoop: { type: 'boolean', title: 'Iterate until done', default: false } } } as const;
    assert.equal(isRalphLoopEnabled(retitled, { useRalphLoop: true }), true);
    // A schema without the property never arms the loop, whatever else the form holds.
    assert.equal(isRalphLoopEnabled({ properties: { other: { type: 'boolean', title: 'Use Ralph loop' } } }, { other: true }), false);
});

test('isRalphLoopEnabled falls back to the schema default for a cleared value', function () {
    const defaultOn = { properties: { useRalphLoop: { type: 'boolean', title: 'Use Ralph loop', default: true } } } as const;
    assert.equal(isRalphLoopEnabled(defaultOn, {}), true);
    assert.equal(isRalphLoopEnabled(SCHEMA, {}), false);
    assert.equal(isRalphLoopEnabled(defaultOn, { useRalphLoop: false }), false);
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
