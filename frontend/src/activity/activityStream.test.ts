import assert from 'node:assert/strict';
import test from 'node:test';

import { appendUserMessage, type ClaudeStreamEvent, emptyTranscript, reduceTranscript, removeItem, type TranscriptState } from './activityStream.ts';

// Fold a sequence of events into a fresh transcript, the way the queue provider does one at a time.
const reduceAll = function (events: ClaudeStreamEvent[], initial?: TranscriptState): TranscriptState {
    let state = initial ?? emptyTranscript();
    for (const event of events) {
        state = reduceTranscript(state, event);
    }
    return state;
};

const messageStart = function (id: string): ClaudeStreamEvent {
    return { type: 'stream_event', event: { type: 'message_start', message: { id } } };
};

test('text deltas build one item that the consolidated assistant message reconciles, not duplicates', function () {
    const state = reduceAll([
        messageStart('m1'),
        { type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } } },
        { type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hel' } } },
        { type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'lo' } } },
        // The consolidated message carries the authoritative text (here with a tail the deltas never delivered).
        { type: 'assistant', message: { id: 'm1', content: [{ type: 'text', text: 'Hello there' }] } }
    ]);
    assert.equal(state.items.length, 1);
    assert.deepEqual(state.items[0], { kind: 'text', id: 'm1:0', text: 'Hello there' });
});

test('a delta targeting a non-last item still lands via the fallback scan', function () {
    const state = reduceAll([
        messageStart('m1'),
        { type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: 'first' } } },
        { type: 'stream_event', event: { type: 'content_block_start', index: 1, content_block: { type: 'text', text: 'second' } } },
        // Out-of-order delivery: the delta addresses block 0 while block 1 is the last item.
        { type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '!' } } }
    ]);
    assert.deepEqual(state.items.map(function (item) { return (item as { text: string }).text; }), ['first!', 'second']);
});

test('a delta matching no item returns the SAME state, so subscribers are not notified for a no-op', function () {
    const before = reduceAll([
        messageStart('m1'),
        { type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: 'hi' } } }
    ]);
    const after = reduceTranscript(before, { type: 'stream_event', event: { type: 'content_block_delta', index: 5, delta: { type: 'text_delta', text: 'lost' } } });
    assert.equal(after, before);
});

test('thinking blocks stream into their own item and reconcile from the consolidated message', function () {
    const streaming = reduceAll([
        messageStart('m1'),
        { type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } } },
        { type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'Let me ' } } },
        { type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'reason' } } }
    ]);
    assert.deepEqual(streaming.items, [{ kind: 'thinking', id: 'm1:0', text: 'Let me reason' }]);

    // The consolidated message carries the authoritative thinking text (here with a tail the deltas never delivered).
    const reconciled = reduceAll([
        { type: 'assistant', message: { id: 'm1', content: [{ type: 'thinking', thinking: 'Let me reason it out' }] } }
    ], streaming);
    assert.deepEqual(reconciled.items, [{ kind: 'thinking', id: 'm1:0', text: 'Let me reason it out' }]);
});

test('tool_use input streams as partial json and consolidates to pretty-printed input', function () {
    const streaming = reduceAll([
        messageStart('m1'),
        { type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tool-1', name: 'Read' } } },
        { type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"path":' } } },
        { type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '"a.txt"}' } } }
    ]);
    assert.equal(streaming.items.length, 1);
    assert.deepEqual(streaming.items[0], { kind: 'tool_use', id: 'm1:0', toolUseId: 'tool-1', name: 'Read', input: '{"path":"a.txt"}' });

    const consolidated = reduceTranscript(streaming, { type: 'assistant', message: { id: 'm1', content: [{ type: 'tool_use', id: 'tool-1', name: 'Read', input: { path: 'a.txt' } }] } });
    assert.equal(consolidated.items.length, 1);
    assert.equal((consolidated.items[0] as { input: string }).input, JSON.stringify({ path: 'a.txt' }, null, 2));
});

test('a user event appends its tool_result once, keyed by the originating tool_use id', function () {
    const event: ClaudeStreamEvent = { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: 'file text', is_error: false }] } };
    const first = reduceTranscript(emptyTranscript(), event);
    assert.deepEqual(first.items, [{ kind: 'tool_result', id: 'result:tool-1', toolUseId: 'tool-1', content: 'file text', isError: false }]);
    // The duplicate is a no-op AND returns the same reference, so subscribers are not notified.
    assert.equal(reduceTranscript(first, event), first);
});

test('user_prompt folds into the seeded prompt bubble as its full view', function () {
    const seeded = appendUserMessage(emptyTranscript(), 'concise ask', 'prompt');
    const state = reduceTranscript(seeded, { type: 'user_prompt', text: 'the exact prompt sent to claude' });
    assert.deepEqual(state.items, [{ kind: 'user', id: 'prompt', text: 'concise ask', fullText: 'the exact prompt sent to claude' }]);
});

test('the init event captures the session id and a repeated init returns the same reference', function () {
    const init: ClaudeStreamEvent = { type: 'system', subtype: 'init', model: 'claude', tools: [1, 2], session_id: 'sess-1' };
    const state = reduceTranscript(emptyTranscript(), init);
    assert.equal(state.sessionId, 'sess-1');
    assert.equal(state.items.length, 1);
    assert.equal(reduceTranscript(state, init), state);
});

test('no-op events return the same state reference (the subscription contract)', function () {
    const state = reduceAll([messageStart('m1')]);
    assert.equal(reduceTranscript(state, { type: 'unknown_event_kind' }), state);
    assert.equal(reduceTranscript(state, { type: 'user_prompt', text: '' }), state);
    assert.equal(reduceTranscript(state, { type: 'assistant', message: { id: 'm1', content: [] } }), state);
});

test('results are keyed per turn so a chat continuation appends its own result item', function () {
    const state = reduceAll([
        messageStart('m1'),
        { type: 'result', result: 'first turn', duration_ms: 10 },
        messageStart('m2'),
        { type: 'result', result: 'second turn', duration_ms: 20 }
    ]);
    const results = state.items.filter(function (item) { return item.kind === 'result'; });
    assert.equal(results.length, 2);
    assert.notEqual(results[0].id, results[1].id);
});

test('removeItem drops by id and returns the same reference when the id is absent', function () {
    const seeded = appendUserMessage(emptyTranscript(), 'queued follow-up', 'user:1');
    const removed = removeItem(seeded, 'user:1');
    assert.deepEqual(removed.items, []);
    assert.equal(removeItem(seeded, 'no-such-id'), seeded);
});

test('competition events fold into a prompt bubble per pairing and a verdict text item', function () {
    const state = reduceAll([
        { type: 'competition_start', index: 1, count: 2, firstTitle: 'idea-a', secondTitle: 'idea-b', prompt: 'judge these two' },
        { type: 'competition_result', index: 1, count: 2, match: { winnerTitle: 'idea-b', rationale: 'more leverage' } },
        // A duplicate delivery of either line must not add a second item.
        { type: 'competition_start', index: 1, count: 2, firstTitle: 'idea-a', secondTitle: 'idea-b', prompt: 'judge these two' }
    ]);
    assert.deepEqual(state.items, [
        { kind: 'user', id: 'competition:1', text: 'Match 1/2: idea-a vs idea-b', fullText: 'judge these two' },
        { kind: 'text', id: 'competition-result:1', text: 'Winner: idea-b\n\nmore leverage' }
    ]);
});
