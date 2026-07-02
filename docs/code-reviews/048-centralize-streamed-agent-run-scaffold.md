# 048 - Five runClaude* helpers repeat the same streamed-run scaffold (and the same dangerous flag)

- **Area**: modularising / extracting shared helpers on the backend
- **Files**: [backend/utils/runClaudeApply.js](../../backend/utils/runClaudeApply.js),
  [backend/utils/runClaudeApplyBatch.js](../../backend/utils/runClaudeApplyBatch.js),
  [backend/utils/runClaudeGenerate.js](../../backend/utils/runClaudeGenerate.js),
  [backend/utils/runClaudeRunTask.js](../../backend/utils/runClaudeRunTask.js),
  [backend/utils/runClaudeChat.js](../../backend/utils/runClaudeChat.js),
  [backend/utils/spawnClaude.js](../../backend/utils/spawnClaude.js)
- **Status**: proposed (review only - not implemented)

## Finding

Each streamed agent helper repeats the identical run scaffold around its one real contribution (the prompt):

```js
emitUserPrompt(onLine, prompt);                       // (all but chat)
return spawnClaudeStreamAsync({
    cwd,
    args: ['-p', prompt, ...CLAUDE_STREAM_FLAGS, '--dangerously-skip-permissions'],
    timeoutMs: <PER-KIND CONSTANT>,
    timeoutMessage: '<per-kind message>',
    signal,
    onLine
});
```

Five copies (apply, apply-batch, generate, run-task, chat; run-task adds `--resume` absence and a finally-block,
chat adds `--resume <sessionId>`). Costs of the repetition:

- `--dangerously-skip-permissions` - the single most consequential flag in the backend - appears five times with
  no rationale at any of them (review 015 flags the missing docs; the missing CODE-side rationale has the same
  root: there is no single place to put it).
- Any change to the run recipe (a new stream flag, the SIGKILL escalation from review 008, an env tweak) must be
  applied five times; nothing but discipline keeps the five aligned. The two buffered helpers (title,
  commit-message) already share `spawnClaudeAsync`, showing the intended pattern.

## Suggested improvement

- Add one scaffold function in `spawnClaude.js`, the natural owner:

  ```js
  // All UI-triggered agent runs execute with permission prompts disabled: a headless run has no way to surface a
  // permission prompt to the browser, so a gated run would simply hang. <- the rationale, written once
  const runStreamedAgentAsync = function ({ cwd, prompt, extraArgs = [], timeoutMs, timeoutMessage, signal, onLine, echoPrompt = true }) {
      if (echoPrompt) { emitUserPrompt(onLine, prompt); }
      return spawnClaudeStreamAsync({ cwd, args: ['-p', prompt, ...extraArgs, ...CLAUDE_STREAM_FLAGS, '--dangerously-skip-permissions'], timeoutMs, timeoutMessage, signal, onLine });
  };
  ```

- Each runClaude* file shrinks to its prompt builder, timeout constant, and a one-call wrapper (`chat` passes
  `extraArgs: ['--resume', sessionId], echoPrompt: false`; run-task keeps its Ralph-state `finally`).
- This is the enabling step for reviews 008 (escalation logic lands once) and 015 (the flag's rationale has a
  single commented home).

## Verification

- `node --run lint`, `node --run typecheck`, and `node --run test` pass.
- Manual smoke: one run of each kind (apply, batch, generate, task, chat follow-up, title) behaves as before -
  prompt bubble seeded, stream renders, cancel kills the child, timeouts keep their per-kind messages.

## Risk

Low. Pure consolidation of argument assembly; per-kind prompts, timeouts, and special args stay where they are.
