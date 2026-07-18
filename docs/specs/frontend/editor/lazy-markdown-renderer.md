# SpecCard's Markdown renderer loads lazily

`SpecCard` loads `react-markdown` through `lazy(() => import('react-markdown'))`, the same on-demand treatment the
app's other heavy optional stacks get (RawXmlView's prism, ActivityDetail's streamdown, TaskOptionsForm's rjsf). The
two review-mode render sites wrap in `Suspense` with the PLAIN-TEXT rendering as the fallback, so toggling Markdown
on shows ordinary text for the split second the chunk loads instead of a blank.

## Why

The review-mode Markdown toggle is off by default and persisted off, yet the static import put react-markdown's
remark/micromark stack into the entry chunk - paid by every session on the plain-HTTP LAN/phone context the project
supports. Verified at implementation time: the main `index-*.js` dropped from ~717K to ~600K, `micromark` no longer
appears in it, and the stack ships as a separate `react-markdown-*.js` chunk fetched only when the toggle is first
enabled.
