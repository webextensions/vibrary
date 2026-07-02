# 047 - Full agent output is console.log'd in production at three sites

- **Area**: improving log hygiene / general cleanup of debugging leftovers
- **Files**: [frontend/src/App.tsx](../../frontend/src/App.tsx),
  [frontend/src/components/RunActionSection.tsx](../../frontend/src/components/RunActionSection.tsx),
  [frontend/src/components/SpecsEditor.tsx](../../frontend/src/components/SpecsEditor.tsx)
- **Status**: proposed (review only - not implemented)

## Finding

Three call sites await an enqueued job's promise purely to dump the agent's ENTIRE final output into the browser
console, in production, on every successful run:

```
App.tsx:504                console.log(`[vibrary] claude -p output for ${path}:\n${claudeOutput}`)
SpecsEditor.tsx:461        console.log(`[vibrary] apply output for ${label}:\n${await promise}`)
RunActionSection.tsx:138   console.log(`[vibrary] ${runAction.label} output for "${value.title}":\n${output}`)
```

Each carries a comment marking it as debugging aid ("Surface the agent's raw output for debugging the generation
run", "the job's raw stdout is logged to the browser console for debugging"). Since those were written, the app
grew a full activity transcript: every run's streamed events, final result text, duration, and cost are rendered in
the Activity monitor's detail tab - a strictly better view of the same data. What remains is:

- routine console noise on every successful run (agent outputs are frequently multi-kilobyte);
- an awkward code shape kept alive only for the log: RunActionSection and SpecsEditor both hold `await`s (and their
  try/catch wrappers) whose sole purpose is the console line - the surrounding comments have to explain that "the
  await does not block the UI" precisely because the await exists only to log;
- an inconsistency: the catch sides (`console.error(... failed ...)`) duplicate what the queue already records on
  the job (`status: 'error'`, `error` message, shown in the monitor and the detail tab).

The `console.error` sites in SettingsProvider are different - they log genuine failures with no other visible home
(reviewed separately in 006/020 context) - and should stay.

## Suggested improvement

- Drop the three success-path `console.log` lines and their scaffolding: `handleGenerate` keeps its await (it needs
  completion to reload the file) minus the log; RunActionSection's and SpecsEditor's fire-and-forget enqueues lose
  the trailing `try { console.log(await promise) } catch { console.error }` blocks entirely - the returned promise
  can be ignored (`void enqueue(...)`), since the queue itself records success/failure and the monitor displays it.
- If a raw-stdout escape hatch is genuinely still wanted, gate it once behind a dev flag (e.g.
  `if (import.meta.env.DEV)`) in ONE place - the queue provider's `execute` - instead of per call site.

## Verification

- `node --run lint`, `node --run typecheck`, and `node --run test` pass.
- Manual check: run a generate and an apply - console stays quiet on success; the Activity detail tab still shows
  the full output. A failed run still surfaces in the monitor (status Failed + error text) as before.

## Risk

Low. Removes only logging and the code that exists to feed it; job execution, retry, and error display all live in
the queue and are untouched.
