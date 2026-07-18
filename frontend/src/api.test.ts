import assert from 'node:assert/strict';
import test from 'node:test';

import { applySpec } from './api.ts';

// Build a fetch stub whose response body is the given NDJSON lines, delivered as one chunk and then a clean
// end-of-stream - the shape the frontend sees when the backend (or the dev proxy) closes the connection.
const fetchReturningLines = function (lines: string[]) {
    return function () {
        const body = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new TextEncoder().encode(lines.map((line) => `${line}\n`).join('')));
                controller.close();
            }
        });
        return Promise.resolve(new Response(body, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } }));
    };
};

const spec = { title: 'a-spec', content: 'content', notes: '', instructions: '' };

test('a stream that ends with the _exit sentinel resolves with the result text', async function (t) {
    t.mock.method(globalThis, 'fetch', fetchReturningLines([
        '{"type":"system","subtype":"init"}',
        '{"type":"result","result":"all done"}',
        '{"type":"_exit","code":0,"error":null}'
    ]));
    assert.equal(await applySpec(spec, {}), 'all done');
});

test('a stream that ends WITHOUT the _exit sentinel rejects instead of resolving empty', async function (t) {
    t.mock.method(globalThis, 'fetch', fetchReturningLines([
        '{"type":"system","subtype":"init"}',
        '{"type":"assistant","message":{"id":"m1","content":[]}}'
    ]));
    await assert.rejects(applySpec(spec, {}), { message: 'The connection to the server was lost while the agent was running' });
});

test('an _exit line carrying an error rejects with that error message', async function (t) {
    t.mock.method(globalThis, 'fetch', fetchReturningLines([
        '{"type":"system","subtype":"init"}',
        '{"type":"_exit","code":1,"error":"claude exited with code 1"}'
    ]));
    await assert.rejects(applySpec(spec, {}), { message: 'claude exited with code 1' });
});
