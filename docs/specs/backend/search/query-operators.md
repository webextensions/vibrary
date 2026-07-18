# Search query operators: the filter panel's vocabulary, folder-wide

The Search query box understands `type:`, `label:`, `approved:`, `by:`, `file:` and a `-` negation prefix, so
"unapproved specs mentioning oauth" is one keyboard-native query: `type:spec approved:no oauth`. No new data - the
scan already parses full entries and simply never used their fields.

## The shared parser

[shared/parseSearchQuery.js](../../shared/parseSearchQuery.js) splits a raw query into the free-text needle and the
constraints. It is SHARED (and listed in package.json `files`, exercised by the smoke test) because both stacks must
split identically: the backend evaluates constraints, and the panel must know a constraint-only query is valid -
two parsers would drift on exactly the tokens users type. Conservative on purpose: a colon in prose ("note: check
this") and an unknown field ("typo:spec") stay needle text, so a user who never heard of operators is never
surprised. One deviation from the proposal's sketch: values are kept RAW at parse time and case-folded per field at
evaluation, because `file:` values are gitignore-style globs where case matters.

## Evaluation

In [backend/search/searchVibrary.js](../../../backend/search/searchVibrary.js):

- `type:`/`label:` compare case-insensitively (labels whole, not substring); `approved:yes|no|stale` maps onto
  `approvalState`'s current/none/stale - the same helper behind the card's green/yellow button, not a fourth
  definition of approved; `by:ai|human|unspecified` maps onto `createdBy`. An unknown vocabulary value matches
  nothing, keeping the AND honest.
- `file:` narrows the listing before any parsing, via the same `ignore` library that backs `.vibraryinclude` - so
  `file:specs*.xml` behaves exactly like the include pattern users already know - and ANDs with the panel's file
  multi-select rather than replacing it.
- **The floor rule changed** (both sides together): MIN_QUERY_LENGTH applies to the needle only, and only when there
  are no constraints - `type:spec` alone is "list every spec", and the existing MAX_TOTAL_MATCHES /
  MAX_MATCHES_PER_FILE caps (and the truncated flag) bound its cost. A constraint-only match's snippet is the head of
  the entry's content (there is no needle to window around).

## The panel

Placeholder teaches the first operator ("try type:spec"); each parsed constraint renders as a removable chip under
the box (removing it strips the token, a mistyped operator visibly stays plain text); the Help dialog's Shortcuts tab
lists the operators - the app's one "things you can type" surface. Snippets highlight the NEEDLE only, and a
constraint-only result's editor jump passes the entry's own title (there is no needle for the staleness re-check).
The CLI's `vibrary search` inherits the operators for free - same worker.

## Tests

- [shared/parseSearchQuery.test.js](../../parseSearchQuery.test.js) - prose colons and unknown fields stay needle
  text; negation; first-colon splitting; raw values.
- [backend/search/searchVibrary.test.js](../../../backend/search/searchVibrary.test.js) - constraint-only queries
  (the floor change) with head-of-content snippets, approved: agreeing with approvalState, AND semantics, negation,
  case-insensitive labels, and file: globs.
