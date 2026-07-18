import assert from 'node:assert/strict';
import { test } from 'node:test';

import { rekeyTabsState } from './rekeyTabs.ts';

const tab = function (path: string, isDirty: boolean, fileHash = 'hash-1') {
    return { path, dirty: isDirty, fileHash };
};

test('a rekeyed tab keeps its unsaved edits, dirty flag and fileHash under the new path', function () {
    const state = { tabs: [tab('specs.xml', true), tab('tasks.xml', false)], activePath: 'tasks.xml' };
    const next = rekeyTabsState(state, 'specs.xml', 'specs-auth.xml');
    // Everything but the path carries over: a rename moves bytes without changing them, so the version token the
    // save route checks is still the right one.
    assert.deepEqual(next.tabs[0], { path: 'specs-auth.xml', dirty: true, fileHash: 'hash-1' });
    assert.deepEqual(next.tabs[1], tab('tasks.xml', false));
    assert.equal(next.activePath, 'tasks.xml');
});

test('the active path follows the rename when it pointed at the old name', function () {
    const state = { tabs: [tab('specs.xml', true)], activePath: 'specs.xml' };
    assert.equal(rekeyTabsState(state, 'specs.xml', 'specs-auth.xml').activePath, 'specs-auth.xml');
});

test('a rename of a file with no open tab returns the state unchanged (same reference)', function () {
    const state = { tabs: [tab('specs.xml', false)], activePath: 'specs.xml' };
    assert.equal(rekeyTabsState(state, 'other.xml', 'renamed.xml'), state);
});
