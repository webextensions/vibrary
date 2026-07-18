# Single apply is a batch of one

There is one apply surface: `POST /api/apply-batch` and its worker
[backend/files/runClaudeApplyBatch.js](../../../backend/files/runClaudeApplyBatch.js). The frontend's single-card
"Apply this spec" sends a one-entry batch through `applySpecs` (see the `applyOne` adapter in
`RunActionSection.tsx`); the batch prompt's opening line goes singular for one entry, and entries are still numbered
(`Spec 1:` - harmless for one). The `apply-spec` job kind remains client-side vocabulary for the monitor's label; it
no longer implies a separate HTTP surface.

## Why

`/apply` (one spec) and `/apply-batch` (N specs) were parallel implementations of the same operation - two routes,
two prompt builders, two timeout policies, two workers, two API helpers - and they had already drifted: a single
apply got a flat 10-minute budget while the same spec through the batch route got 12 minutes and the much more
helpful timeout message ("the working tree may be partially updated - review it in Source Control"). Folding them
gives future prompt/timeout changes one place to land.

## Consequences

- A one-entry apply now gets the batch's scaled timeout (base 10 min + 2 min per entry, capped at 60) and its
  partial-update timeout message - the drift resolved in favor of the better behavior.
- `runClaudeApply.js` and the `/apply` route are gone completely (no alias route, per the repo's no-legacy-traces
  rule). Anything outside the frontend calling `/api/apply` directly would break; the API is local and undocumented,
  so the blast radius is the repo itself.
- Route tests exercise the batch route for the single-entry NDJSON contract, the 413 prompt-size guard, and
  validation failures.
