import assert from 'node:assert/strict';
import test from 'node:test';

import { tabLabel } from './tabLabel.ts';

// tabLabel is the single labelling rule shared by the editor's TabBar and the Explorer's "Open Editors" list, so the
// two always show the same tab name. Pin both branches: an explicit label wins, otherwise the path's basename.

test('a file tab falls back to the path basename', function () {
    assert.equal(tabLabel({ path: 'specs.xml', dirty: false }), 'specs.xml');
    assert.equal(tabLabel({ path: 'docs/nested/tasks-auth.xml', dirty: true }), 'tasks-auth.xml');
});

test('an explicit label (an activity tab) wins over the basename', function () {
    assert.equal(tabLabel({ path: 'activity:job-1', dirty: false, label: '3 specs' }), '3 specs');
});
