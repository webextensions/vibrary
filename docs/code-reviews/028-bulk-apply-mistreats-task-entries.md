# 028 - Bulk "Apply changes" runs task entries through the apply-spec prompt

- **Area**: aligning behavior with what a user would expect / docs truthfulness
- **Files**: [frontend/src/components/SpecsEditor.tsx](../../frontend/src/components/SpecsEditor.tsx),
  [backend/utils/runClaudeApplyBatch.js](../../backend/utils/runClaudeApplyBatch.js),
  [docs/editor.md](../editor.md)
- **Status**: proposed (review only - not implemented)

## Finding

`docs/editor.md` says the bulk **Actions > Apply changes** "queues the same headless-agent run as the single-card
button over every ticked entry". For `task` entries that is not what happens:

- Single-card, a task's button is "Run this task": the run-task prompt ("Carry out the following task... do the work
  it describes"), plus the task's per-run options form (`formSchemaRef` -> options block) and the Ralph-loop opt-in.
- Bulk, `handleApplyChanges` (SpecsEditor.tsx ~line 419) filters the selection to `spec.type === 'spec' || 'task'`
  (`applicableSpecs`) and sends everything through `applySpecs` -> the BATCH APPLY prompt: "Apply the following
  specs to this project's codebase... make any code changes needed so the project conforms to all of them."

So a ticked task - say "update outdated npm packages" - is presented to the agent as a conformance spec, and its
per-run options (the very reason task forms exist) are silently dropped; `optionsToPrompt` never runs in the bulk
path. The code's own comment acknowledges the framing problem for reviews/ideas ("applying a review/idea through
this bulk flow would send it through the 'apply spec' prompt nonsensically") but includes tasks, which have the
same mismatch in milder form: their action verb is "run", not "apply".

## Suggested improvement

Options in increasing effort; any of them removes the lie in the docs:

- Smallest: restrict bulk Apply changes to `spec` entries and count ticked tasks among the skipped (the popup
  already reports skipped reviews/ideas, so the message shape exists). Tasks keep their richer single-card flow.
- Type-aware batch: keep tasks in the batch but make `runClaudeApplyBatch.buildPrompt` label each entry with its
  action ("Spec N - make the project conform" vs "Task N - carry out the work"), and include each task's rendered
  options block. More faithful, but grows the batch prompt logic.
- Docs-only fallback: change `editor.md` to say tasks are batched as specs without their options - truthful, but it
  documents a behavior users are unlikely to want.

The first option matches the app's existing instinct (the skip message) and keeps the batch semantics coherent.

## Verification

- `node --run lint`, `node --run typecheck`, and `node --run test` pass.
- Manual check: tick one spec + one task, open Actions - the popup reports the task as skipped (option 1) or the
  activity bubble's full prompt shows the task framed as a task with its options (option 2). `editor.md`'s claim
  matches whichever behavior ships.

## Risk

Low. The bulk path is additive UI; the change narrows or relabels what gets sent, never touching the single-card
flows.
