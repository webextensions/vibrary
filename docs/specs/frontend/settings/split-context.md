# Settings context: the state/actions split

`SettingsProvider` serves two contexts, mirroring the activity queue's documented pattern:

- `SettingsStateContext` - `{ loaded, isKindEnabled, hasStoredTaskOptions, saveError }`, memoized on
  `[settings.notifications, hasStoredTaskOptions, loaded, saveError]`. The deps deliberately EXCLUDE
  `settings.taskOptions`: a per-keystroke options edit changes only that slice (persist spreads it fresh while
  `notifications` keeps its reference), so the state identity holds and no state consumer re-renders.
- `SettingsActionsContext` - the mutators plus `getTaskOptions`, frozen once in a `useState` initializer (the same
  first-render-closure freeze the queue's actions use; everything the closures touch is render-stable refs and
  setState functions, and every mutation folds off `latestReference`). `getTaskOptions` reads the live ref, which is
  what lets it live in the stable bundle - callers use it for one-time seeding gated on `loaded`, not as a
  subscription.

## Why

The old single flat store was rebuilt every provider render, so every `useSettings` consumer re-rendered whenever ANY
setting changed. The hottest writer is rjsf's per-keystroke task-options `onChange`, and the widest consumers are
per-card (`RunActionSection` on every spec/task card): one keystroke in one card's form re-rendered every other
card's run section. With the split, typing re-renders only the card owning the form.

## Consumer mapping

- `ActivityNotifier`: state (`isKindEnabled` - genuinely needs live notification toggles).
- `ActivityMonitor`'s settings menu: state for the toggles/error display, actions for the mutations.
- `RunActionSection`: state for `loaded` only; readers/writers from actions.
