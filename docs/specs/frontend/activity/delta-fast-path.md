# Transcript delta fast path

The `content_block_delta` branch of the transcript reducer
([frontend/src/activity/activityStream.ts](../../../frontend/src/activity/activityStream.ts)) checks the LAST item
first: one delta arrives per streamed token and virtually always targets the block most recently started, so the
common case is O(1) - `[...items.slice(0, -1), updated]` - instead of an O(items) `.map()` over the whole transcript.
A fallback `findIndex` scan keeps pathological orderings correct, and a delta matching no item returns the SAME state
object.

## Why

Long runs (an hour-long Ralph-loop task) accumulate thousands of items, so late-run tokens each paid a full-array
scan and reallocation - measured linear at ~2.8us/delta at 200 items and ~24.8us at 2000 on desktop Node,
extrapolating to tens of ms per second plus per-token GC pressure on the phone-class hardware the project supports.
The cost sat inside the reducer, paid whether or not the tab was open.

The old `.map()` also returned a NEW array even when no item matched (for example a delta for an unrendered block
type), so the store's `next.items !== previous.items` check notified subscribers for a no-op re-render. The fast
path's identity return fixes that for free.

## Tests

[frontend/src/activity/activityStream.test.ts](../../../frontend/src/activity/activityStream.test.ts) pins the
fallback path (a delta targeting a non-last item) and the same-state guarantee for an unmatched delta, alongside the
existing delta-folding cases which pass unchanged.
