# 036 - /chat forwards an unvalidated sessionId onto the claude CLI's argv

- **Area**: tightening validation / defense-in-depth on process arguments
- **Files**: [backend/routes/files.js](../../backend/routes/files.js),
  [backend/utils/runClaudeChat.js](../../backend/utils/runClaudeChat.js)
- **Status**: proposed (review only - not implemented)

## Finding

`POST /chat` validates `sessionId` only as a non-empty string (files.js ~line 390) and hands it straight to the
CLI invocation:

```js
args: ['-p', message, '--resume', sessionId, ...CLAUDE_STREAM_FLAGS, '--dangerously-skip-permissions']
```

The array-form `spawn` rules out shell injection, but option-VALUE positions are still parser-dependent territory:

- A `sessionId` beginning with `-` (e.g. `--verbose`, `--mcp-config=...`) sits where `--resume`'s value belongs.
  Whether the claude CLI treats that as the resume value, an error, or - worst case - as `--resume` with a missing
  value followed by an injected FLAG depends entirely on its argument parser's behavior, which this code does not
  control and may change between CLI versions. Given the process already runs with
  `--dangerously-skip-permissions`, keeping foreign flags out of its argv is cheap insurance.
- Legitimate session ids have a known shape: the value is captured from claude's own stream-json `init` event and
  is a UUID. Anything else (a truncated id, a pasted garbage value from a hand-rolled API call) currently produces
  a claude CLI failure whose stderr surfaces as an opaque 500-ish `_exit` error, rather than a clean 400 naming the
  actual problem.

The same reasoning applies wherever request fields land in option-value positions, but `sessionId` is the only one
that is machine-shaped (the prompt fields are genuinely freeform and are safely consumed as `-p`'s value).

## Suggested improvement

- Validate the shape in the route, mirroring the codebase's existing validator style (`isValidVibraryName` et al):

  ```js
  const SESSION_ID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (typeof sessionId !== 'string' || !SESSION_ID_REGEX.test(sessionId)) {
      return sendErrorResponse(response, 400, 'Expected "sessionId" to be a session UUID');
  }
  ```

- If coupling to the UUID format feels too tight (should the CLI ever change its id shape), the minimum is rejecting
  a leading `-` and whitespace/control characters - that alone removes the flag-confusion class.

## Verification

- `node --run lint`, `node --run typecheck`, and `node --run test` pass.
- `curl -X POST /api/chat` with `sessionId: "--verbose"` returns the clean 400; a real session id captured from a
  finished run still resumes correctly through the UI's chat composer.

## Risk

None to the UI flow (it only ever sends ids captured from the stream); the change narrows what non-UI callers can
put on the agent's argv.
