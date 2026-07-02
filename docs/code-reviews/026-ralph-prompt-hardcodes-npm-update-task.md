# 026 - Generic Ralph-loop prompt block hardcodes "this npm-update task"

- **Area**: general cleanup of leftovers / prompt correctness
- **Files**: [backend/utils/runClaudeRunTask.js](../../backend/utils/runClaudeRunTask.js)
- **Status**: proposed (review only - not implemented)

## Finding

`runTaskAsync` is the generic executor for EVERY "Run this task" action, and when the per-run "Use Ralph loop"
option is ticked it appends a loop-driving block to the prompt. That block contains a sentence tied to one specific
task (around line 45):

```js
"- Choose the iteration limit yourself via --max-iterations, sized to this task's scope: enough iterations to",
'  make incremental progress and self-correct, but bounded by a sensible cap so the loop cannot run away. For',
"  this npm-update task, scale it to how many packages actually need updating (a small floor, a modest cap).",
```

"For this npm-update task, scale it to how many packages actually need updating" was evidently written for a
specific dependency-update task (the schema-sync comment above the regex even references
`docs/tasks/tasks.xml.schemas.json`, whose example option is `useRalphLoop`) and then landed in the shared helper.

Consequence: every Ralph-enabled run of ANY task tells the agent it is running an npm-update task and to size its
iteration budget by "how many packages actually need updating". For a task that has nothing to do with packages,
that is at best confusing noise in the prompt and at worst steers the agent's iteration sizing with an irrelevant
heuristic. Prompts are code here; this is the prompt equivalent of a hardcoded test value left in a library
function.

## Suggested improvement

- Drop the task-specific sentence, keeping the generic guidance:
  "...sized to this task's scope: enough iterations to make incremental progress and self-correct, but bounded by a
  sensible cap so the loop cannot run away."
- If per-task sizing hints are wanted, they already have a home: the task entry's own `content`/`notes`, or the
  per-run custom instructions - all of which are included in the same prompt and are authored per task.

## Verification

- `node --run lint`, `node --run typecheck`, and `node --run test` pass (the string is not referenced by tests).
- Run any Ralph-enabled task and open the activity bubble's "Full" prompt view: the npm-update sentence is gone;
  the rest of the loop block is intact.

## Risk

None beyond prompt-tuning: the only behavior change is removing a misleading instruction from generated prompts.
