# prefers-reduced-motion coverage

Every CSS module that declares an `animation:` guards it behind `@media (prefers-reduced-motion: reduce)`:

- `SpecsEditor.module.css` and `ResponsiveDialog.module.css` - the original two guards (speed dial, dialog fade/panel).
- `App.module.css`, `Sidebar.module.css`, `SourceControlPanel.module.css`, `SpecCard.module.css` - the infinite `spin`
  loops on refresh icons and busy spinners.
- `ActivityDetail.module.css` - the typing dots, which otherwise bounce for the entire length of a streaming reply.

## Why

WCAG 2.3.3 and the platform convention say the preference should still all non-essential motion, and the unguarded
animations were exactly the ones that matter most - infinite loops running for minutes at a time. Spinners keep
conveying in-flight state without the rotation: the indicator stays visible and every button involved is `disabled`
while busy, which already provides the visual cue. The frozen typing dots stay visible too; the bubble's meaning is
unchanged.

## Convention for new animations

Follow the per-file pattern (a `@media (prefers-reduced-motion: reduce)` block naming the animated selectors with
`animation: none`) whenever a module gains an `animation:` declaration - the guard lives next to the animation it
stills.
