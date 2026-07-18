# Thinking blocks in the activity transcript

The transcript reducer ([frontend/src/activity/activityStream.ts](../../../frontend/src/activity/activityStream.ts))
folds extended-thinking content blocks into their own `{ kind: 'thinking' }` items: created on `content_block_start`,
grown by `thinking_delta` deltas, and reconciled from the consolidated assistant message's `thinking` field - the same
three-stage lifecycle text and tool_use blocks already follow. `ActivityDetail` renders them collapsed behind a
"Thinking" disclosure, de-emphasized like the tool cards.

## Why

Thinking blocks used to fall through all three type checks and vanish. Whether they appear depends on the CLI/model
configuration vibrary is run with - plain `claude -p` runs may not think, but user-level settings can enable it, and
the run recipe opts into `--include-partial-messages` for full-fidelity streaming. When thinking WAS present, the
visible symptom was a long silent pause in the typewriter view while tokens were in fact streaming - the exact
confusion the streaming UI exists to prevent. Rendering collapsed keeps the reasoning available as context without
letting it dominate the transcript.

## Tests

[frontend/src/activity/activityStream.test.ts](../../../frontend/src/activity/activityStream.test.ts) pins the
stream-then-reconcile lifecycle for a thinking block (deltas accumulate; the consolidated message's authoritative text
wins).
