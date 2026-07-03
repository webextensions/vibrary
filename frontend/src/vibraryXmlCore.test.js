import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { approvalState, countApprovedSpecs, emptySpec, hashContent, parseVibraryXml, serializeVibraryXml } from './vibraryXmlCore.js';

// Drop the client-only `id` field before comparing parsed entries: parseVibraryXml assigns a fresh randomId() on every
// call by design (ids are never serialized), so two parses of the same document never agree on it.
const withoutId = function (entries) {
    return entries.map(function (entry) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to drop it from `rest`
        const { id, ...rest } = entry;
        return rest;
    });
};

describe('parseVibraryXml', function () {
    it('returns [] for an empty document', function () {
        assert.deepEqual(parseVibraryXml(''), []);
    });

    it('returns [] for a whitespace-only document', function () {
        assert.deepEqual(parseVibraryXml('   \n  '), []);
    });

    it('rejects malformed XML', function () {
        assert.throws(function () {
            parseVibraryXml('<root><entries><entry><title>unclosed</root>');
        });
    });

    it('defaults every optional field for an entry that only sets type/title/content', function () {
        const xml = [
            '<root>',
            '  <entries>',
            '    <entry type="task">',
            '      <title>minimal-entry</title>',
            '      <content>Just content, nothing else.</content>',
            '    </entry>',
            '  </entries>',
            '</root>'
        ].join('\n');

        const [entry] = parseVibraryXml(xml);

        assert.equal(entry.type, 'task');
        assert.equal(entry.title, 'minimal-entry');
        assert.equal(entry.content, 'Just content, nothing else.');
        assert.equal(entry.createdBy, '');
        assert.equal(entry.approved, '');
        assert.deepEqual(entry.relatesTo, []);
        assert.equal(entry.notes, '');
        assert.equal(entry.formSchemaRef, '');
        assert.deepEqual(entry.labels, []);
        assert.equal(entry.created, '');
        assert.equal(entry.updated, '');
        assert.equal(entry.updatedBy, '');
        // Recomputed from content, not read from a (missing) <contentHash>.
        assert.equal(entry.contentHash, hashContent({ content: entry.content }));
    });

    it('falls back to "spec" for a missing or unrecognized type attribute', function () {
        const xml = [
            '<root><entries>',
            '  <entry><title>no-type</title><content>x</content></entry>',
            '  <entry type="bogus"><title>bad-type</title><content>y</content></entry>',
            '</entries></root>'
        ].join('\n');

        const [noType, badType] = parseVibraryXml(xml);
        assert.equal(noType.type, 'spec');
        assert.equal(badType.type, 'spec');
    });

    it('drops an unrecognized createdBy/updatedBy value rather than accepting arbitrary text', function () {
        const xml = [
            '<root><entries>',
            '  <entry><title>x</title><createdBy>Robot</createdBy><content>x</content></entry>',
            '</entries></root>'
        ].join('\n');

        const [entry] = parseVibraryXml(xml);
        assert.equal(entry.createdBy, '');
    });
});

describe('serializeVibraryXml + parseVibraryXml round-trip', function () {
    it('is idempotent: parse -> serialize -> parse yields the same entries (ignoring id)', function () {
        const xml = [
            '<root>',
            '  <entries>',
            '    <entry type="spec">',
            '      <title>round-trip-spec</title>',
            '      <createdBy>Human</createdBy>',
            '      <approved>abc123</approved>',
            '      <content>Some content here.</content>',
            '      <contentHash>abc123</contentHash>',
            '      <relatesTo><ref>other-entry</ref></relatesTo>',
            '      <notes>A note.</notes>',
            '      <formSchemaRef>tasks.xml.schemas.json#opts</formSchemaRef>',
            '      <labels><label>one</label><label>two</label></labels>',
            '      <created>2026-01-01T00:00:00.000Z</created>',
            '      <updated>2026-01-02T00:00:00.000Z</updated>',
            '      <updatedBy>AI</updatedBy>',
            '    </entry>',
            '  </entries>',
            '</root>'
        ].join('\n');

        const firstParse = parseVibraryXml(xml);
        const serialized = serializeVibraryXml(firstParse);
        const secondParse = parseVibraryXml(serialized);

        assert.deepEqual(withoutId(secondParse), withoutId(firstParse));

        // Serializing again from the second parse should reproduce byte-identical XML - the true idempotency check.
        assert.equal(serializeVibraryXml(secondParse), serialized);
    });

    it('round-trips an empty entry list to an empty <entries/> and back to []', function () {
        const serialized = serializeVibraryXml([]);
        assert.deepEqual(parseVibraryXml(serialized), []);
    });

    it('round-trips multiple entries of different types in order', function () {
        const xml = [
            '<root><entries>',
            '  <entry type="review"><title>first</title><content>a</content></entry>',
            '  <entry type="idea"><title>second</title><content>b</content></entry>',
            '</entries></root>'
        ].join('\n');

        const parsed = parseVibraryXml(xml);
        const reparsed = parseVibraryXml(serializeVibraryXml(parsed));

        assert.deepEqual(withoutId(reparsed).map(function (entry) { return entry.type; }), ['review', 'idea']);
        assert.deepEqual(withoutId(reparsed).map(function (entry) { return entry.title; }), ['first', 'second']);
    });
});

describe('hashContent', function () {
    it('is deterministic for the same content', function () {
        assert.equal(hashContent({ content: 'hello world' }), hashContent({ content: 'hello world' }));
    });

    it('differs for different content', function () {
        assert.notEqual(hashContent({ content: 'hello' }), hashContent({ content: 'hello!' }));
    });

    it('returns a lowercase hex string zero-padded to at least 13 characters', function () {
        // padStart(13, '0') guarantees a floor, not a ceiling - the combined 53-bit value can need up to 14 hex digits.
        assert.match(hashContent({ content: '' }), /^[0-9a-f]{13,14}$/);
        assert.match(hashContent({ content: 'some longer content to hash' }), /^[0-9a-f]{13,14}$/);
    });
});

describe('approvalState', function () {
    it('is "none" when approved is empty', function () {
        const spec = { content: 'x', approved: '' };
        assert.equal(approvalState(spec), 'none');
    });

    it('is "current" when approved matches the content hash', function () {
        const spec = { content: 'x', approved: hashContent({ content: 'x' }) };
        assert.equal(approvalState(spec), 'current');
    });

    it('is "stale" when approved no longer matches the (since-edited) content', function () {
        const spec = { content: 'x-edited', approved: hashContent({ content: 'x' }) };
        assert.equal(approvalState(spec), 'stale');
    });

    // The parser trims edge whitespace and XML normalizes CRLF, so an approval hashed against the raw textarea value
    // would go stale on the next reload without any edit. hashContent normalizes the same way to keep the invariant.
    it('stays "current" across a save/load round trip for content with edge whitespace or CRLF', function () {
        for (const content of ['approved text\n', '    indented\nend', 'a\r\nb', 'plain']) {
            const spec = { title: 't', content, approved: hashContent({ content }), contentHash: hashContent({ content }), type: 'spec', createdBy: '', relatesTo: [], notes: '', formSchemaRef: '', labels: [], created: '', updated: '', updatedBy: '' };
            const [reloaded] = parseVibraryXml(serializeVibraryXml([spec]));
            assert.equal(approvalState(reloaded), 'current', `content ${JSON.stringify(content)} went ${approvalState(reloaded)}`);
        }
    });
});

// The typed wrapper (vibraryXml.ts) pins this untyped core's signatures with `as` casts - unchecked promises that
// TypeScript cannot verify. These asserts turn silent cast drift into a red test: the canonicalize script once broke
// exactly this way, assuming parseVibraryXml returned { type, entries } and serializeVibraryXml took two arguments.
describe('core API shapes the vibraryXml.ts casts promise', function () {
    it('parseVibraryXml returns a plain array of entries', function () {
        assert.equal(Array.isArray(parseVibraryXml('')), true);
        assert.equal(Array.isArray(parseVibraryXml('<root><entries><entry><title>t</title></entry></entries></root>')), true);
    });

    it('serializeVibraryXml takes a single entries argument and returns a string', function () {
        assert.equal(serializeVibraryXml.length, 1);
        assert.equal(typeof serializeVibraryXml([]), 'string');
    });

    it('emptySpec honors its optional type argument and defaults to spec', function () {
        assert.equal(emptySpec().type, 'spec');
        assert.equal(emptySpec('task').type, 'task');
    });

    it('hashContent and approvalState accept the documented spec-shaped inputs', function () {
        const hash = hashContent({ content: 'x' });
        assert.equal(typeof hash, 'string');
        assert.equal(approvalState({ content: 'x', approved: hash }), 'current');
    });
});

describe('countApprovedSpecs', function () {
    it('counts only entries currently approved, ignoring none/stale ones', function () {
        const none = { content: 'a', approved: '' };
        const current = { content: 'b', approved: hashContent({ content: 'b' }) };
        const stale = { content: 'c-edited', approved: hashContent({ content: 'c' }) };

        assert.equal(countApprovedSpecs([none, current, stale]), 1);
    });

    it('is 0 for an empty list', function () {
        assert.equal(countApprovedSpecs([]), 0);
    });
});
