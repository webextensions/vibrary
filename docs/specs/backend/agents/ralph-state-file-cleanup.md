# Ralph state-file cleanup: async and outcome-preserving

`runTaskAsync`'s `finally` block ([backend/files/runClaudeRunTask.js](../../../backend/files/runClaudeRunTask.js))
removes a leftover `.claude/ralph-loop.local.md` with `await rm(..., { force: true })` from `node:fs/promises`,
wrapped in a try/catch that logs and swallows.

## Why

- It was the backend's only synchronous filesystem call in a request path (`rmSync`) - everything else uses
  `node:fs/promises` - so it read as an oversight, not a choice. The blocking window was tiny; this is a consistency
  fix.
- More importantly, a cleanup failure other than "missing file" (for example EACCES on a read-only `.claude/`) used to
  throw out of `finally` and REPLACE the run's original error - a timeout's descriptive message would be swallowed by
  a permission error about the cleanup. The catch guarantees cleanup problems can never mask the run's real outcome.
- The `path.join` namespace import replaced the bare `join` import to match backend precedent, folded in because the
  lines were being edited anyway.
