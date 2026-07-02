import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalize } from './canonicalize-vibrary.js';

// Two documents that differ ONLY in meaningless order: entry order, field order within an entry, and item order
// inside <relatesTo>/<labels>. The diff driver depends on these canonicalizing to identical text.
const ORIGINAL = `<root>
    <entries>
        <entry type="spec">
            <title>b-entry</title>
            <content>Bee content</content>
            <relatesTo>
                <ref>r-one</ref>
                <ref>r-two</ref>
            </relatesTo>
            <labels>
                <label>x</label>
                <label>y</label>
            </labels>
        </entry>
        <entry type="task">
            <title>a-entry</title>
            <content>Ay content</content>
        </entry>
    </entries>
</root>
`;

const REORDERED = `<root>
    <entries>
        <entry type="task">
            <content>Ay content</content>
            <title>a-entry</title>
        </entry>
        <entry type="spec">
            <labels>
                <label>y</label>
                <label>x</label>
            </labels>
            <relatesTo>
                <ref>r-two</ref>
                <ref>r-one</ref>
            </relatesTo>
            <content>Bee content</content>
            <title>b-entry</title>
        </entry>
    </entries>
</root>
`;

test('canonicalize collapses pure reorderings (entries, fields, list items) to identical output', function () {
    assert.equal(canonicalize(ORIGINAL), canonicalize(REORDERED));
});

test('canonicalize keeps a real content change visible', function () {
    const edited = ORIGINAL.replace('Bee content', 'Changed content');
    assert.notEqual(canonicalize(ORIGINAL), canonicalize(edited));
});

test('canonicalize is deterministic across repeated runs on the same input', function () {
    assert.equal(canonicalize(ORIGINAL), canonicalize(ORIGINAL));
});

test('canonicalize handles an empty document without throwing', function () {
    assert.equal(typeof canonicalize(''), 'string');
});

test('canonicalize throws on malformed XML (callers fall back to raw bytes, with a warning)', function () {
    assert.throws(function () {
        canonicalize('<root><entries><entry>unclosed</root>');
    });
});
