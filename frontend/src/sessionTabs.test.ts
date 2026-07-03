import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { readSessionTabs, writeSessionTabs } from './sessionTabs.ts';

// These run under plain node, so provide the one browser global sessionTabs touches: a minimal in-memory
// localStorage. The suite pins the per-folder round-trip, the shape validation guarding against foreign/corrupt
// stored values, and the LRU eviction - especially its slice() boundary, where a missing Math.max floor would evict
// from the front while still UNDER the cap (see the comment in writeSessionTabs).

const storage = new Map<string, string>();
const fakeLocalStorage = {
    getItem(key: string) {
        return storage.get(key) ?? null;
    },
    setItem(key: string, value: string) {
        storage.set(key, value);
    },
    removeItem(key: string) {
        storage.delete(key);
    }
};
// Installed via defineProperty (not a plain assignment, which the lint rule rightly flags for production code):
// stubbing the browser global is the point of this test setup.
Object.defineProperty(globalThis, 'window', { value: { localStorage: fakeLocalStorage }, configurable: true });

const STORAGE_KEY = 'vibrary:open-tabs';

beforeEach(function () {
    storage.clear();
});

test('writeSessionTabs / readSessionTabs round-trip per folder', function () {
    writeSessionTabs('/home/a', { paths: ['specs.xml'], activePath: 'specs.xml' });
    writeSessionTabs('/home/b', { paths: ['tasks.xml', 'ideas.xml'], activePath: null });
    assert.deepEqual(readSessionTabs('/home/a'), { paths: ['specs.xml'], activePath: 'specs.xml' });
    assert.deepEqual(readSessionTabs('/home/b'), { paths: ['tasks.xml', 'ideas.xml'], activePath: null });
    assert.equal(readSessionTabs('/home/unknown'), null);
});

test('readSessionTabs rejects corrupt storage and foreign record shapes', function () {
    storage.set(STORAGE_KEY, 'not json at all');
    assert.equal(readSessionTabs('/home/a'), null);

    storage.set(STORAGE_KEY, JSON.stringify({
        '/home/a': { paths: 'not-an-array', activePath: null },
        '/home/b': { paths: [42], activePath: null },
        '/home/c': { paths: [], activePath: 7 },
        '/home/d': 'not an object'
    }));
    assert.equal(readSessionTabs('/home/a'), null);
    assert.equal(readSessionTabs('/home/b'), null);
    assert.equal(readSessionTabs('/home/c'), null);
    assert.equal(readSessionTabs('/home/d'), null);
});

test('writeSessionTabs keeps every folder while under the cap', function () {
    // The regression the Math.max comment guards against: a negative slice end would evict from the FRONT even when
    // the map is still under the 20-folder cap.
    for (let index = 0; index < 5; index += 1) {
        writeSessionTabs(`/folder/${index}`, { paths: [], activePath: null });
    }
    for (let index = 0; index < 5; index += 1) {
        assert.notEqual(readSessionTabs(`/folder/${index}`), null, `folder ${index} should still be tracked`);
    }
});

test('writeSessionTabs evicts the least-recently-written folder past the cap', function () {
    for (let index = 0; index < 20; index += 1) {
        writeSessionTabs(`/folder/${index}`, { paths: [], activePath: null });
    }
    // Rewriting folder 0 moves it to the most-recently-used end, so the next eviction hits folder 1 instead.
    writeSessionTabs('/folder/0', { paths: ['specs.xml'], activePath: null });
    writeSessionTabs('/folder/20', { paths: [], activePath: null });

    assert.equal(readSessionTabs('/folder/1'), null, 'the least-recently-written folder is evicted');
    assert.deepEqual(readSessionTabs('/folder/0'), { paths: ['specs.xml'], activePath: null });
    assert.notEqual(readSessionTabs('/folder/20'), null);
    assert.notEqual(readSessionTabs('/folder/19'), null);
});
