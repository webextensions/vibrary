---
description: The comment tags used to annotate code, and the DO_NOT_COMMIT marker convention
---

# Comment Tags

The tag vocabulary for source comments (`// TODO: ...`, `// HACK: ...`). Use these tags - not ad-hoc
variants - so annotations stay greppable:

- `FIXME` - known defect; fix it when touching this area
- `HACK` - inelegant workaround that works; if the reason is non-obvious, document it in
  [docs/because/](../../docs/because/README.md)
- `HARD-CODE` - deliberately hardcoded value that may need to become configurable
- `NOT-THOROUGH-BUT-GOOD-ENOUGH` - deliberately incomplete handling, acceptable for the current
  use case
- `NOTE` - context the next reader needs and the code cannot show
- `OPTIMIZE` - known performance improvement opportunity, not worth doing yet
- `REVIEW-AI-CODE` - AI-generated code that still awaits human review
- `SIMPLE-UNOPTIMIZED-CODE` - deliberately simple implementation; optimize only when it matters
- `TODO` - pending work

## APP-CUSTOMIZATIONS

A `BEGIN: APP-CUSTOMIZATIONS` / `END: APP-CUSTOMIZATIONS` comment pair fences fork-specific edits
inside otherwise-shared files. On template merges the fenced block is expected to conflict - keep
the fork's side; everything outside the fences takes the template's updates.

## DO_NOT_COMMIT

A line containing `DO_NOT_COMMIT` marks temporary code (debug logging, local experiments) that must
never land in a commit - the health-check suite fails while such a line exists (enforced by
[scripts/health-checks/checks/block-DO_NOT_COMMIT-code-lines.sh](../../scripts/health-checks/checks/block-DO_NOT_COMMIT-code-lines.sh)).
A file that mentions the marker legitimately (like this one) exempts itself by also containing
`ALLOW_DO_NOT_COMMIT`.
