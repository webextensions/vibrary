# 003 - ResponsiveDialog ignores closable for Escape and backdrop dismissal

- **Area**: UI/UX behavior alignment / component API footgun
- **Files**: [frontend/src/components/ResponsiveDialog.tsx](../../frontend/src/components/ResponsiveDialog.tsx),
  [frontend/src/components/CreateEntriesDialog.tsx](../../frontend/src/components/CreateEntriesDialog.tsx)
- **Status**: proposed (review only - not implemented)

## Finding

`ResponsiveDialog` accepts a `closable` prop (`true` | `false` | `'disabled'`), but it only controls the close
BUTTON's visibility/disabled state. The two other dismissal paths ignore it entirely:

- the Escape key handler (around `ResponsiveDialog.tsx` line 113) calls `onClose()` unconditionally
- the backdrop mousedown handler (around line 161) calls `onClose()` unconditionally

So a dialog rendered with `closable={false}` (no close button at all) or `closable="disabled"` (visually
"you cannot close this right now") still fires `onClose` when the user presses Escape or clicks the backdrop. The
component's visual contract and its behavioral contract disagree.

The only current caller that uses a non-`true` value, `CreateEntriesDialog`, has to compensate by re-implementing the
guard inside its own `onClose`:

```tsx
onClose={function () {
    // A run edits files on disk, so block dismissal until it finishes rather than leaving it orphaned.
    if (!generating) {
        onClose();
    }
}}
closable={generating ? 'disabled' : true}
```

That works, but it means every future caller of `closable={false}`/`'disabled'` must know to duplicate this guard, or
they get a dialog that looks un-dismissable while Escape silently dismisses it - for `CreateEntriesDialog` that would
have meant orphaning an in-flight AI run that edits files on disk. Defaults should make the dangerous mistake
impossible rather than relying on each caller's discipline.

## Suggested improvement

- In `ResponsiveDialog`, compute a single `canDismiss` from `closable` (`true` only when `closable` is undefined or
  `true`) and gate all three dismissal paths on it: the close button (already handled), the Escape branch of the
  keydown handler, and `handleBackdropMouseDown`.
- With that in place, `CreateEntriesDialog` can pass `onClose={onClose}` directly and drop its local guard - the
  `closable={generating ? 'disabled' : true}` prop it already passes becomes the single source of truth.

## Verification

- `node --run lint`, `node --run typecheck`, and `node --run test` pass.
- Manual check: open "Create entries with AI", start a run, then press Escape and click the backdrop - the dialog must
  stay open until the run finishes (same as today), and after the change the same holds with the caller-side guard
  removed. When idle, Escape and backdrop-click still close it.

## Risk

Low. The only behavioral change is suppressing Escape/backdrop dismissal in states that already render the dialog as
not closable; the sole existing caller already enforces that behavior manually.
