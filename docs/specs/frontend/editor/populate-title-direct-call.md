# Populate calls the title API directly, not through the queue

`SpecCard.handlePopulate` calls `populateTitle` directly - mirroring the commit-message flow in `SourceControlPanel` -
instead of enqueueing a job on the strictly-serial activity queue. The `title` job kind is gone from the queue
vocabulary (`JobKind`, `KIND_META`, the notification defaults).

## Why

The backend deliberately exempts its two quick buffered helpers (`/title`, `/git/generate-message`) from the
one-agent-at-a-time guard: "the UI runs them alongside a queued job by design" (see `backend/files/agents.js`). The
commit-message half honored that; the title half enqueued, so clicking Populate while a task ran (up to an hour) left
the button spinning behind the whole queue with no hint why - and the backend's concurrency exemption was unreachable.

## What changed with leaving the queue

- The activity-monitor row for title jobs is gone. It carried no transcript (the call is buffered), so it only ever
  showed status - which the button's own spinner conveys in the place the user is looking.
- Failures now toast at the button ("Could not derive a title") - previously they were only logged to the console, so
  this is a strict improvement in feedback.
- An in-flight Populate aborts when the card unmounts (an `AbortController` mirroring the commit-message twin); the
  abort is not reported as a failure.
- Stored settings that still contain a `notifications.title` key are dropped by `normalizeSettings`' iterate-defaults
  coercion - no migration needed.
