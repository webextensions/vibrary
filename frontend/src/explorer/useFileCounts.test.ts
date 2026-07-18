import assert from 'node:assert/strict';
import test from 'node:test';

import { emptySpec } from '../xml/vibraryXml.ts';
import { countLiveBrokenReferences } from './useFileCounts.ts';

// countLiveBrokenReferences backs the live half of the sidebar's broken-reference badge. Its subtle rules mirror the
// backend's /files-summary counting: the known-titles set is the folder-wide SAVED titles plus this file's own LIVE
// titles (so an unsaved rename or new entry resolves immediately), and the count is total occurrences, not distinct
// targets.

const specWith = function (title: string, relatesTo: string[]) {
    return { ...emptySpec(), title, relatesTo };
};

test('counts occurrences whose target exists neither saved folder-wide nor live in the file', function () {
    const specs = [
        specWith('alpha', ['saved-elsewhere', 'ghost']),
        specWith('beta', ['alpha', 'ghost'])
    ];
    // 'ghost' dangles twice (total occurrences, not distinct targets); 'alpha' resolves live, 'saved-elsewhere' saved.
    assert.equal(countLiveBrokenReferences(specs, new Set(['saved-elsewhere'])), 2);
});

test("the file's own live titles resolve references even before a save", function () {
    const specs = [
        specWith('brand-new', []),
        specWith('pointer', ['brand-new'])
    ];
    assert.equal(countLiveBrokenReferences(specs, new Set()), 0);
});

test('an empty file has nothing dangling', function () {
    assert.equal(countLiveBrokenReferences([], new Set(['whatever'])), 0);
});
