# 014 - Batch apply: unbounded entry count against a fixed 10-minute timeout

- **Area**: aligning behavior with user expectations / missed edge cases
- **Files**: [backend/utils/runClaudeApplyBatch.js](../../backend/utils/runClaudeApplyBatch.js),
  [backend/routes/files.js](../../backend/routes/files.js)
- **Status**: proposed (review only - not implemented)

## Finding

The single-spec apply and the batch apply share the same fixed ceiling:

- `runClaudeApply.js`: `APPLY_TIMEOUT_MS = 10 * 60 * 1000` for ONE spec.
- `runClaudeApplyBatch.js`: the same `APPLY_TIMEOUT_MS = 10 * 60 * 1000` for ALL selected specs in one run.

And unlike its sibling actions, the batch route has no size cap: `POST /apply-batch` validates shape only
(`entries.length === 0` is the sole count check), while `/generate` caps its count at `MAX_GENERATE_COUNT = 50`. The
editor's "Apply changes" action sends every selected entry, so selecting a large file's worth of specs produces a
run that:

- is far more likely to hit the fixed 10-minute wall than the single-spec run the timeout was sized for ("room to
  read the codebase and edit files" - per entry, that room shrinks as the batch grows);
- on timeout is SIGTERM'd mid-edit (see `spawnClaude.js`'s kill-tree), potentially leaving the working tree half
  conformed to spec 7 of 20, with only "Applying the specs timed out" to explain the state;
- in the extreme, can exceed the OS's per-argument size limit, since the whole batch prompt is passed as ONE argv
  element (`-p <prompt>`; Linux caps a single argument around 128 KiB), failing with a spawn error rather than a
  useful message.

The user-facing expectation gap: nothing in the UI or docs suggests "Apply changes" over many entries is riskier
than applying them one at a time; the failure mode (timeout + partially applied batch) is silent about which entries
were completed.

## Suggested improvement

Smallest proportionate fixes, in preference order:

- Scale the ceiling with the batch: e.g. `timeoutMs = APPLY_TIMEOUT_MS + PER_ENTRY_MS * entries.length` with a sane
  overall cap, so a 20-spec run is not held to a 1-spec budget.
- Add a batch-size cap in the route (mirroring `MAX_GENERATE_COUNT`'s pattern and error style), chosen generously -
  its job is only to catch the pathological select-all-in-a-huge-file case before argv limits or the model's context
  do.
- Improve the timeout message to include the batch size ("Applying 17 specs timed out after 10 minutes; the working
  tree may be partially updated - review it in Source Control"), so the partial-state consequence is at least named
  where the user will read it.

## Verification

- `node --run lint`, `node --run typecheck`, and `node --run test` pass.
- Manual check: with a stub `claude` that sleeps, POST `/apply-batch` with N entries and confirm the effective
  timeout grows with N (or the cap rejects, with the documented message). Confirm the timeout error text names the
  batch size.

## Risk

Low. Timeout arithmetic and a validation message; no change to what a successful run does.
