# 023 - The activity transcript reducer is pure, fragile, and completely untested

- **Area**: adding tests where fragile behavior is unexercised
- **Files**: [frontend/src/activityStream.ts](../../frontend/src/activityStream.ts),
  [package.json](../../package.json)
- **Status**: proposed (review only - not implemented)

## Finding

`activityStream.ts` folds claude's `stream-json` events into the transcript every activity tab renders. It is the
kind of code tests exist for:

- Pure by design (the file's own comments emphasize it): `reduceTranscript(state, event)` returns a new state or the
  SAME reference for no-op events - and that reference equality is load-bearing, since the queue provider uses it to
  decide whether to notify `useSyncExternalStore` subscribers. An accidental always-new-object return would not
  break rendering; it would cause every event to re-render every subscriber, a regression invisible to eyeballs.
- It encodes a subtle protocol: per-token deltas build items live (`content_block_start`/`delta` keyed by
  `messageId:index`), then the consolidated assistant message must RECONCILE those same items rather than append
  duplicates; tool results arrive as whole `user` events matched by `tool_use_id`; `user_prompt` folds into the
  seeded prompt bubble as its "full" view; the session id must be captured exactly once.
- It has real edge cases already handled defensively (missing `message.id`, non-string block text, string vs
  block-array tool results in `stringifyToolResult`, duplicate `content_block_start` dedup) - none of which anything
  exercises, so any of them can silently regress.

The only test file in the repo covers `vibraryXmlCore.js`. The `test` script (`node --test
frontend/src/**/*.test.js`) cannot even see a test for this module today - and since `activityStream.ts` is
TypeScript, a new test needs one tooling decision made first (below).

## Suggested improvement

- Add `frontend/src/activityStream.test.ts` with table-driven cases built from realistic event sequences (the file
  header documents the exact shape): start -> text deltas -> consolidated assistant message yields one text item
  with the final text; tool_use start + input_json deltas -> consolidated message yields one tool item with parsed
  input; a `user` tool_result matches its `tool_use_id`; `user_prompt` upgrades the seeded bubble; no-op events
  return the SAME state reference (assert with `assert.equal(next, previous)` - this pins the subscription
  contract); `removeItem` returns the same reference when the id is absent.
- Tooling decision for running a `.test.ts` under `node --test`:
    - Node runs TypeScript via type stripping by default from 22.18/23.6; the manifest's `engines`
      (`^20.19.0 || >=22.12.0`) admits older versions where it is flag-gated. Either tighten `engines`, or add
      `--experimental-strip-types` to the test script (harmless where stripping is already default), or
    - keep tests in `.js` and import the built-in-JS surface only - workable for `vibraryXmlCore`, but
      `activityStream.ts` would need conversion or stripping, so the flag/engines route is the smaller change.
- Widen the `test` glob to `frontend/src/**/*.test.{js,ts}` (and see review 004 for including `backend/`).

## Verification

- `node --run test` runs the new file and passes on the oldest Node the `engines` field admits.
- Mutation check: swapping the reducer's same-reference return for a cloned object makes the reference-equality
  test fail; removing the consolidation branch makes the dedup test fail.

## Risk

None to runtime (test-only), plus one deliberate tooling choice (strip-types flag or engines bump) that should be
made consciously rather than implied.
