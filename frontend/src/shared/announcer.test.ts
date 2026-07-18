import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';

import { announce, getAnnouncement } from './announcer.ts';

test('an announcement lands after the speak delay', async function () {
    assert.equal(getAnnouncement(), '');
    announce('Saved specs.xml');
    // Synchronously the region is (re)cleared; the text lands a beat later.
    assert.equal(getAnnouncement(), '');
    await delay(80);
    assert.equal(getAnnouncement(), 'Saved specs.xml');
});

test('the same text announced twice in a row is spoken twice (the case this store exists to fix)', async function () {
    announce('Saved specs.xml');
    await delay(80);
    assert.equal(getAnnouncement(), 'Saved specs.xml');
    // A live region only speaks on change: the second announce must pass through '' so the re-set registers.
    announce('Saved specs.xml');
    assert.equal(getAnnouncement(), '');
    await delay(80);
    assert.equal(getAnnouncement(), 'Saved specs.xml');
});

test('a newer announcement supersedes one still waiting to speak', async function () {
    announce('first');
    announce('second');
    await delay(80);
    assert.equal(getAnnouncement(), 'second');
});
