import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_NOTIFICATIONS, normalizeSettings } from './settings.ts';

// normalizeSettings guards every shape the settings file can arrive in (a missing file's {}, missing keys, wrong
// types, unknown notification kinds, non-record task options); table-pin the coercions so callers can keep skipping
// their own guards.

test('garbage in yields complete defaults out', function () {
    for (const raw of [undefined, null, 42, 'nope', [], { notifications: 'x', taskOptions: 7 }]) {
        assert.deepEqual(normalizeSettings(raw), { notifications: { ...DEFAULT_NOTIFICATIONS }, taskOptions: {}, competitionPrompt: '' });
    }
});

test('partial notifications merge over the defaults; unknown kinds are dropped', function () {
    const normalized = normalizeSettings({ notifications: { 'run-task': false, 'title': true, 'bogus': true } });
    assert.deepEqual(normalized.notifications, { ...DEFAULT_NOTIFICATIONS, 'run-task': false });
});

test('a non-boolean notification value falls back to its default', function () {
    const normalized = normalizeSettings({ notifications: { generate: 'yes' } });
    assert.equal(normalized.notifications.generate, DEFAULT_NOTIFICATIONS.generate);
});

test('task options keep record values and drop everything else', function () {
    const normalized = normalizeSettings({
        taskOptions: {
            'tasks.xml.schemas.json#a': { useRalphLoop: true },
            'tasks.xml.schemas.json#b': ['not', 'a', 'record'],
            'tasks.xml.schemas.json#c': 'nope',
            'tasks.xml.schemas.json#d': null
        }
    });
    assert.deepEqual(normalized.taskOptions, { 'tasks.xml.schemas.json#a': { useRalphLoop: true } });
});

test('the competition prompt keeps a stored string and defaults everything else to empty', function () {
    assert.equal(normalizeSettings({ competitionPrompt: 'Pick the bolder bet: {{entryA}} vs {{entryB}}' }).competitionPrompt, 'Pick the bolder bet: {{entryA}} vs {{entryB}}');
    assert.equal(normalizeSettings({}).competitionPrompt, '');
    assert.equal(normalizeSettings({ competitionPrompt: 42 }).competitionPrompt, '');
});
