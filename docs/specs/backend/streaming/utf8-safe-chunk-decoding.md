# UTF-8-safe chunk decoding for the claude child process

`runClaudeProcess` in [backend/shared/spawnClaude.js](../../../backend/shared/spawnClaude.js) sets
`setEncoding('utf8')` on the child's stdout and stderr immediately after spawn, so `data` events emit strings decoded
through Node's internal `StringDecoder`.

## Why

Without an encoding, `data` chunks are Buffers whose boundaries fall at arbitrary byte offsets. A multi-byte UTF-8
character (accented letters, CJK, emoji - all plausible in entry content echoed through the agent stream) that
straddles a chunk boundary decodes as replacement characters (U+FFFD) when each chunk is converted with
`Buffer.prototype.toString()` separately: the corruption reaches the streamed transcript the frontend persists and the
buffered stdout the title generator consumes, silently and unrecoverably. `StringDecoder` retains partial multi-byte
sequences until their continuation bytes arrive, so the reassembled text is intact.

## Tests

[backend/shared/spawnClaude.test.js](../../../backend/shared/spawnClaude.test.js) drives the real spawn path against a
fake `claude` CLI that writes a 4-byte emoji split mid-character across two flushes and asserts the resolved stdout
round-trips intact. The test fails when the `setEncoding` calls are removed.
