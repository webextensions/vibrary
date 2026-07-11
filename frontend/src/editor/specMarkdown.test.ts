import assert from 'node:assert/strict';
import test from 'node:test';

import { emptySpec } from '../xml/vibraryXml.ts';
import { specToMarkdown } from './specMarkdown.ts';

// The Markdown export shape is a user-facing contract (pasted into PRs/docs), so pin how the title, content, and the
// optional sections render - and that empty optional fields are omitted rather than left as empty headings.

test('a full entry renders heading, content, and every present optional section', function () {
    const spec = {
        ...emptySpec('task'),
        title: 'ship-the-thing',
        content: 'Do the work.\nThen verify it.',
        notes: 'Careful with the edge case.',
        labels: ['backend', 'urgent'],
        relatesTo: ['other-spec']
    };
    assert.equal(
        specToMarkdown(spec),
        [
            '# ship-the-thing',
            '',
            'Do the work.\nThen verify it.',
            '',
            '## Notes',
            '',
            'Careful with the edge case.',
            '',
            '**Labels:** backend, urgent',
            '',
            '**Relates to:** other-spec',
            ''
        ].join('\n')
    );
});

test('a bare entry omits the optional sections and uses the untitled placeholder', function () {
    const spec = { ...emptySpec('idea'), content: 'Just a thought.' };
    assert.equal(specToMarkdown(spec), '# untitled idea\n\nJust a thought.\n');
});
