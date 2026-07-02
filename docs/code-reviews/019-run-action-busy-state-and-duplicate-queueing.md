# 019 - Run/Apply button: busy label shows at the wrong time, and re-clicks queue duplicate runs

- **Area**: aligning behavior with what a user would expect from a control
- **Files**: [frontend/src/components/RunActionSection.tsx](../../frontend/src/components/RunActionSection.tsx)
- **Status**: proposed (review only - not implemented)

## Finding

The card's "Apply this spec" / "Run this task" button uses an `applying` flag whose lifetime does not match what the
labels claim (around lines 98-142):

- `setApplying(true)` is called only around the custom-instructions `promptDialog` (and only when the checkbox is
  ticked). So the button reads "Running..." / "Applying..." with a spinner while the user is merely LOOKING AT A
  TEXT PROMPT - nothing is running - and flips back to its idle label the moment the job is actually enqueued.
- During the real run, the button is fully enabled again (by design, the card "returns as soon as the job is
  enqueued - progress lives in the activity monitor"). But that leaves nothing debouncing the click itself: an
  impatient double-click, or clicking again because the button gave no acknowledgment, silently enqueues the SAME
  entry twice. The queue then runs the same spec/task twice back to back - for an apply, that is two headless agents
  editing the working tree in sequence.

The Activity monitor opening on enqueue is real feedback, but it is peripheral; the control the user actually
pressed communicates the opposite of the truth in both phases (busy while idle, idle while queued/running).

## Suggested improvement

- Rename the state to what it covers (`prompting`) and stop using the run labels for it - while the instructions
  dialog is open the button can simply stay disabled with its normal label (the dialog itself is the affordance).
- Reflect the entry's real queue state on the button: the queue context already exposes the job list, so derive
  `hasActiveRunForEntry` (a queued/running job with this entry's kind and label/title) and render the button as
  disabled "Queued..." / "Running..." accordingly. This gives the button truthful state AND makes duplicate
  queueing impossible without forbidding intentional re-runs after completion.
- If intentional double-queueing is considered a feature (queue the same task twice on purpose), the middle ground
  is a confirm when an identical job is already queued/running - mirroring how the app confirms other
  likely-unintended actions (dirty close, reload over edits).

## Verification

- `node --run lint`, `node --run typecheck`, and `node --run test` pass.
- Manual check: tick custom instructions, click Run - the button no longer claims "Running..." while the prompt is
  open. Click Run and immediately click again - the second click is a no-op (or asks), and exactly one job appears
  in the Activity monitor. After the job finishes, the button is clickable again.

## Risk

Low. The change is confined to one component's button state; queue mechanics are untouched.
