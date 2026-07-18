# Screen-reader announcements: one polite live region, plus a skip link

The app had zero `aria-live` regions - its static ARIA (67 aria-labels, aria-expanded, dialog roles) was good, but
every dynamic change happened in silence. Now a single polite live region announces the changes that have no other
audible channel, and a skip link jumps keyboard users past the chrome.

## The announcer

- [frontend/src/shared/announcer.ts](../../../frontend/src/shared/announcer.ts) - a module-level message store
  (`announce(text)` + `useAnnouncement()` via `useSyncExternalStore`). Module-level rather than context so any call
  site can announce with a plain import and there is exactly ONE region by construction - two live regions racing is
  worse than none.
- [frontend/src/shared/Announcer.tsx](../../../frontend/src/shared/Announcer.tsx) - the visually-hidden
  `aria-live="polite"` region, mounted once at the App root.
- The two-step announce (clear to `''`, then set the text a beat later, then clear again after a few seconds) is the
  classic hand-rolled-announcer bug fix: a live region only speaks on CHANGE, so "Saved specs.xml" right after
  "Saved specs.xml" would otherwise be silently dropped - and save/save/save is precisely the repeat users perform
  most. [announcer.test.ts](../../../frontend/src/shared/announcer.test.ts) pins that case.

## What is announced (and what deliberately is not)

Announced - the visible changes with no toast:

- A completed save ("Saved specs.xml"), single-save and Save-all alike.
- The filter tally ("3 of 40 entries shown"), debounced so the text filter announces the settled count rather than
  one message per keystroke, and only while a filter actually constrains the list.
- A search's result tally ("12 matches in 3 files" / "No matches.").
- A keyboard approval via the bare `A` key - the one action where a silent misfire matters most.

NOT announced - anything that already fires a toast: react-toastify renders each toast with `role="alert"` (verified
in its source), an implicit assertive live region, so toast text - including the Undo toasts and ActivityNotifier's
job started/finished/failed toasts - is already spoken. Routing toasts through the announcer would speak everything
twice, which is why the proposal's "wrap toast.*" idea was NOT taken.

## The skip link

The first focusable element in the DOM (`App.tsx`), visually parked off-screen until focused, targeting the editor
`<main id="vibrary-editor">` - the rail + sidebar + tab strip are otherwise a toll every keyboard user pays per load.

## Not included

The proposal's optional `eslint-plugin-jsx-a11y` pass was left out: it adds a dependency and lint-policy surface that
deserves its own decision.
