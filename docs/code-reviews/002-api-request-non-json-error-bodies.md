# 002 - api.ts request() turns non-JSON error responses into cryptic SyntaxErrors

- **Area**: tightening error handling / diagnosable error messages
- **Files**: [frontend/src/api.ts](../../frontend/src/api.ts)
- **Status**: proposed (review only - not implemented)

## Finding

The shared `request()` helper (around `frontend/src/api.ts` line 13) parses every response body as JSON
unconditionally:

```ts
const request = async function <T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    const body = (await response.json()) as ApiResponse<T>;
    if (body.status !== 'success') {
        throw new Error(body.errorMessage || `Request failed (${response.status})`);
    }
    return body.output;
};
```

If the server ever answers with a non-JSON body - Express's default HTML error page when a route throws outside the
handlers' own try/catch, an empty body on a connection cut mid-response, or a proxy's 502 page - `response.json()`
rejects with a raw `SyntaxError` (for example `Unexpected token '<' ... is not valid JSON`). That error propagates to
every caller of the API module and surfaces in the UI's toasts and error states as parser noise instead of the actual
failure ("Request failed (500)").

The sibling helper `streamClaude()` in the same file already handles this exact case correctly (around line 34): it
checks `response.ok` and the `Content-Type` header, attempts the envelope parse inside a try/catch, and falls back to
`Request failed (<status>)` when the body is not JSON. So the file currently holds two different standards for the
same problem.

## Suggested improvement

Bring `request()` up to the standard `streamClaude()` already sets:

- Wrap the `response.json()` call in a try/catch; on parse failure, throw `new Error('Request failed
  (' + response.status + ')')` instead of letting the `SyntaxError` escape.
- Optionally check `response.ok` first so a non-2xx with a JSON error envelope still prefers the server's
  `errorMessage`, matching current behavior.

A small shared "parse the ApiResponse envelope, with a status-based fallback" helper used by both `request()` and
`streamClaude()` would remove the duplication, but even the local try/catch alone fixes the user-facing symptom.

## Verification

- `node --run lint`, `node --run typecheck`, and `node --run test` pass.
- Manual check: temporarily make one backend route respond with `response.status(500).send('<html>boom</html>')` and
  confirm the UI toast reads "Request failed (500)" rather than a JSON `SyntaxError`.

## Risk

Low. The change only affects the failure path; the success path and the JSON-envelope error path keep their existing
messages.
