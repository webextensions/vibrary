# 022 - promptDialog: submitting an empty value silently behaves as Cancel

- **Area**: polishing UI/UX (feedback after user actions)
- **Files**: [frontend/src/promptDialog.ts](../../frontend/src/promptDialog.ts)
- **Status**: proposed (review only - not implemented)

## Finding

`promptDialog`'s submit path conflates "empty" with "cancelled" (around line 60):

```ts
const submit = function () {
    const trimmed = input.value.trim();
    if (trimmed === '' && !allowEmpty) {
        finish(null);
        return;
    }
    finish(trimmed);
};
```

For every non-`allowEmpty` prompt - new file name (`Create`), rename (`Rename`), custom one-time run instructions -
pressing the AFFIRMATIVE button (or Enter) with an empty or whitespace-only input closes the dialog and resolves
`null`, which every caller treats as "user cancelled". From the user's side: they clicked "Create", and the dialog
vanished without creating anything, saying anything, or reopening. The most likely reading is "the app is broken",
not "I left the field empty".

The doc comment openly states the behavior ("resolves ... null when the user cancels, submits nothing, or dismisses
via the backdrop"), so this is a deliberate simplification - but it is one that makes the affirmative control
perform the negative action.

There is even a caller-visible inconsistency: for the custom-instructions prompt, `RunActionSection.handleApply`
comments that "cancelling (or leaving it blank) aborts queuing rather than proceeding" - so blank-submit-as-cancel
had to be documented as a quirk at the call site.

## Suggested improvement

Keep the dialog open on an empty submit and make the requirement visible; two proportionate options:

- Minimal: on empty submit, keep the dialog open, set `input.setCustomValidity('A value is required')` +
  `input.reportValidity()` (native tooltip, no new CSS), and refocus the input. Clear the custom validity on the
  next `input` event.
- Alternative: disable the confirm button while `input.value.trim() === ''` (updating on `input` events); Enter
  then has nothing to trigger. Slightly more code, but the affordance is visible before the click.

Either way `null` comes to mean exactly "cancelled" (Cancel button, Escape, backdrop), which also lets the
`RunActionSection` comment drop its parenthetical.

## Verification

- `node --run lint`, `node --run typecheck`, and `node --run test` pass.
- Manual check: sidebar "+" -> leave the name empty -> press Create/Enter: the dialog stays open and indicates a
  value is needed; typing a name and confirming works; Cancel/Escape/backdrop still resolve as cancel. Stash's
  optional-message prompt (`allowEmpty`) still accepts an empty submit.

## Risk

Low. Only the empty-submit path changes, and no current caller relies on it meaning cancel - each would simply stop
receiving a spurious `null`.
