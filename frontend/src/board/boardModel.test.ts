import assert from 'node:assert/strict';
import test from 'node:test';

import { emptySpec, hashContent } from '../xml/vibraryXml.ts';
import { buildBoard, columnForEntry, transitionForMove } from './boardModel.ts';

// The board model's contract: columns derive from fields entries already have, and drags map to exactly the two
// mutations an entry honestly supports.

const entry = function (type: 'spec' | 'review' | 'task' | 'idea', content: string, approved: string) {
    return { ...emptySpec(type), title: `${type}-entry`, content, contentHash: hashContent(content), approved };
};

test('ideas take their own column regardless of approval; the rest bucket by approval state', function () {
    const signed = hashContent('x');
    const staleSignature = hashContent('old text');
    assert.equal(columnForEntry(entry('idea', 'x', signed)), 'idea');
    assert.equal(columnForEntry(entry('spec', 'x', '')), 'draft');
    assert.equal(columnForEntry(entry('task', 'x', signed)), 'approved');
    // Approved against OLD content: the stale state the editor's Reapprove button shows.
    assert.equal(columnForEntry(entry('review', 'new text', staleSignature)), 'stale');
});

test('buildBoard groups across files keeping file coordinates', function () {
    const board = buildBoard([
        { name: 'ideas.xml', entries: [entry('idea', 'a', '')] },
        { name: 'specs.xml', entries: [entry('spec', 'b', ''), entry('spec', 'c', hashContent('c'))] }
    ]);
    assert.deepEqual(board.idea.map(function (card) { return card.file; }), ['ideas.xml']);
    assert.deepEqual(board.draft.map(function (card) { return card.entryIndex; }), [0]);
    assert.deepEqual(board.approved.map(function (card) { return `${card.file}#${card.entryIndex}`; }), ['specs.xml#1']);
    assert.deepEqual(board.stale, []);
});

test('drags map to approve/unapprove only; everything else is a snap-back', function () {
    assert.equal(transitionForMove('draft', 'approved'), 'approve');
    assert.equal(transitionForMove('stale', 'approved'), 'approve');
    assert.equal(transitionForMove('approved', 'draft'), 'unapprove');
    assert.equal(transitionForMove('stale', 'draft'), 'unapprove');
    // Ideas never move by drag (a type change belongs to the editor), and no drag targets Stale or Ideas.
    assert.equal(transitionForMove('idea', 'draft'), null);
    assert.equal(transitionForMove('draft', 'idea'), null);
    assert.equal(transitionForMove('draft', 'stale'), null);
    assert.equal(transitionForMove('approved', 'stale'), null);
    assert.equal(transitionForMove('draft', 'draft'), null);
});
