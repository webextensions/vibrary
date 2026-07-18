import assert from 'node:assert/strict';
import test from 'node:test';

import { applySpecs } from './api.ts';

// Build a fetch stub whose response body delivers the given raw chunks (arbitrary byte boundaries, like a real
// socket) and then a clean end-of-stream.
const fetchReturningChunks = function (chunks: string[]) {
    return function () {
        const body = new ReadableStream<Uint8Array>({
            start(controller) {
                for (const chunk of chunks) {
                    controller.enqueue(new TextEncoder().encode(chunk));
                }
                controller.close();
            }
        });
        return Promise.resolve(new Response(body, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } }));
    };
};

// The common case: whole NDJSON lines, delivered as one chunk.
const fetchReturningLines = function (lines: string[]) {
    return fetchReturningChunks([lines.map((line) => `${line}\n`).join('')]);
};

const entries = [{ title: 'a-spec', content: 'content', notes: '' }];

test('a stream that ends with the _exit sentinel resolves with the result text', async function (t) {
    t.mock.method(globalThis, 'fetch', fetchReturningLines([
        '{"type":"system","subtype":"init"}',
        '{"type":"result","result":"all done"}',
        '{"type":"_exit","code":0,"error":null}'
    ]));
    assert.equal(await applySpecs(entries, '', {}), 'all done');
});

test('a stream that ends WITHOUT the _exit sentinel rejects instead of resolving empty', async function (t) {
    t.mock.method(globalThis, 'fetch', fetchReturningLines([
        '{"type":"system","subtype":"init"}',
        '{"type":"assistant","message":{"id":"m1","content":[]}}'
    ]));
    await assert.rejects(applySpecs(entries, '', {}), { message: 'The connection to the server was lost while the agent was running' });
});

test('an _exit line carrying an error rejects with that error message', async function (t) {
    t.mock.method(globalThis, 'fetch', fetchReturningLines([
        '{"type":"system","subtype":"init"}',
        '{"type":"_exit","code":1,"error":"claude exited with code 1"}'
    ]));
    await assert.rejects(applySpecs(entries, '', {}), { message: 'claude exited with code 1' });
});

test('a line split across two chunks reassembles, and one chunk carrying several lines splits', async function (t) {
    t.mock.method(globalThis, 'fetch', fetchReturningChunks([
        // The result line's JSON is cut mid-string; the second chunk completes it AND carries the _exit line.
        '{"type":"system","subtype":"init"}\n{"type":"result","resu',
        'lt":"reassembled"}\n{"type":"_exit","code":0,"error":null}\n'
    ]));
    assert.equal(await applySpecs(entries, '', {}), 'reassembled');
});

test('a malformed JSON line is skipped without failing the run', async function (t) {
    t.mock.method(globalThis, 'fetch', fetchReturningLines([
        '{"type":"system","subtype":"init"}',
        'this is not json at all',
        '{"type":"result","result":"still fine"}',
        '{"type":"_exit","code":0,"error":null}'
    ]));
    assert.equal(await applySpecs(entries, '', {}), 'still fine');
});

test('a non-OK JSON envelope response rejects with the envelope message', async function (t) {
    t.mock.method(globalThis, 'fetch', function () {
        return Promise.resolve(Response.json({ status: 'error', errorMessage: 'Expected a non-empty "entries" array' }, { status: 400 }));
    });
    await assert.rejects(applySpecs([], '', {}), { message: 'Expected a non-empty "entries" array' });
});
