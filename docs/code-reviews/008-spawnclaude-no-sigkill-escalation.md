# 008 - spawnClaude kill path relies on the child honoring SIGTERM

- **Area**: missed edge cases / robustness of process lifecycle
- **Files**: [backend/utils/spawnClaude.js](../../backend/utils/spawnClaude.js)
- **Status**: proposed (review only - not implemented)

## Finding

`runClaudeProcess` handles timeout and abort by SIGTERM-ing the child's process group:

```js
const killTree = function () {
    try {
        process.kill(-child.pid, 'SIGTERM');
    } catch {
        child.kill('SIGTERM');
    }
};
```

Both the timeout timer and the abort listener call `killTree()` and then wait for the child's `close` event to settle
the promise. There is no escalation: if the `claude` launcher or its worker subprocess ignores SIGTERM (busy in
uninterruptible I/O, a wedged worker, a signal handler that swallows it), nothing ever follows up with SIGKILL, so:

- the promise never settles - the timed-out route handler awaits forever, past its own `timeoutMs`;
- for a streamed run, the terminal `_exit` line is never written, so the UI's activity entry stays "Running"
  indefinitely even though the user hit cancel;
- the orphaned worker keeps running (and, for apply/generate runs, keeps editing files) - exactly what the abort
  machinery exists to prevent, per this file's own header comment.

SIGTERM-then-SIGKILL-after-a-grace-period is the standard pattern for exactly this reason (it is what
`child_process`'s own `timeout` option and process managers like systemd do).

## Suggested improvement

- In `killTree()` (or right after each call to it), arm a one-shot escalation timer, e.g. 5-10 seconds: if the
  `close` event has not fired by then, send `SIGKILL` to the group (with the same single-child fallback).
- Clear the escalation timer in the existing `cleanup()` so a child that exits promptly never sees it.
- No caller-visible API change: the promise still rejects with the same timeout/abort messages, just guaranteed to
  actually settle.

## Verification

- `node --run lint`, `node --run typecheck`, and `node --run test` pass.
- Manual check: stub the `claude` binary on PATH with a script that traps SIGTERM and sleeps
  (`trap '' TERM; sleep 600`), start a run with a short timeout, and confirm the run now fails with the timeout
  message after grace expiry instead of hanging, with no leftover process (`ps` shows the group gone).
- A unit test is feasible if `spawn` is injectable, but the manual stub check is sufficient for this size of change.

## Risk

Low. The escalation only fires in a state that is already broken (kill requested, child still alive after the grace
period); well-behaved children are unaffected.
