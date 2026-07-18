# Ralph-loop opt-in: a structured flag keyed on the schema property

The per-run "use the Ralph loop" opt-in travels as `useRalphLoop: boolean` in the `/run-task` request body. The
frontend derives it from the options form by property KEY (`isRalphLoopEnabled` in
[frontend/src/editor/taskOptions.ts](../../../frontend/src/editor/taskOptions.ts), applying the same cleared-value ->
schema-default fallback as `optionsToPrompt`); the backend route passes `useRalphLoop === true` to `runTaskAsync` as
`isRalphLoopEnabled`, which appends the Ralph-loop prompt block and arms the leftover-state-file cleanup.

## Why

The backend used to regex-match the human-facing line `- Use Ralph loop...: yes` inside the rendered `options` prompt
block. That coupled backend behavior to a display string defined in a USER-editable `*.xml.schemas.json` sidecar: a
user who retitled the property ("Iterate until done", a non-English title) silently lost the loop behavior even
though their form toggled `useRalphLoop`, and any unrelated property whose title started with "Use Ralph loop" turned
it on. Schema KEYS are the stable contract; titles are presentation.

## Contract

- The boolean schema property named `useRalphLoop` is the one documented behavioral key (stated in
  [docs/vibrary-file-format.md](../../vibrary-file-format.md)'s `formSchemaRef` entry).
- The rendered `- <title>: yes` line still appears in the prompt's options block for the agent to read - it is no
  longer the control channel.
- A direct API caller must send the `useRalphLoop` field; the rendered `options` text was never a documented API
  contract.

## Tests

Key detection, retitled-property behavior, absent-property behavior, and the default fallback are pinned in
[frontend/src/editor/taskOptions.test.ts](../../../frontend/src/editor/taskOptions.test.ts) (the old backend regex
tests were removed with the regex).
