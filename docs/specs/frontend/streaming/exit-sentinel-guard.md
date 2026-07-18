# Agent stream exit-sentinel guard

The backend's streaming agent routes terminate every real outcome - clean exit, error, timeout - with a final
`{"type":"_exit", code, error}` NDJSON line (see `streamClaudeRoute` in
[backend/files/agents.js](../../../backend/files/agents.js)). The frontend's `streamClaude` consumer in
[frontend/src/api.ts](../../../frontend/src/api.ts) therefore treats a stream that ends WITHOUT that sentinel as a
lost connection and rejects with "The connection to the server was lost while the agent was running", instead of
resolving successfully with an empty result.

## Why

A connection can end cleanly (FIN) without the backend having finished: a backend restart under `node --watch`, a
server crash, or a proxy dropping the upstream. Before the guard, those runs settled as SUCCESSFUL jobs with an empty
result - a green activity row for an agent that was actually killed mid-edit, possibly leaving the working tree
half-modified. With the guard, the job lands in the queue's existing error path: the notifier toasts the failure and
the activity row offers Retry.

## Behavior contract

- `_exit` with `error: null` - the run finished; `streamClaude` resolves with the last `result` event's text.
- `_exit` with a non-null `error` - the run failed; `streamClaude` rejects with that message.
- Stream ends with no `_exit` seen - the connection died mid-run; `streamClaude` rejects with the connection-lost
  message.
- Client-initiated abort (user cancel) rejects out of `reader.read()` before the sentinel check, so the abort path is
  unaffected by the guard.

## Tests

[frontend/src/api.test.ts](../../../frontend/src/api.test.ts) drives `applySpecs` against a mocked `fetch` whose
NDJSON body covers all three terminal cases above.
