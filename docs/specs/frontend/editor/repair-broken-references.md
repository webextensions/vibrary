# Repair broken references, not just remove them

A dangling `relatesTo` is a statement of intent that lost its target - a rename, a typo, an agent-written ref nothing
validated - and for every cause except a real deletion the intended target is recoverable by string matching. The
card's broken-references badge now carries **Repair...** beside **Remove**: a popup with one row per dangling
reference, its best proposed target ("did you mean ...?") with a per-row Repair, or "no similar entry found" - which
is itself the useful answer, because it says the target really is gone and Remove is the informed choice.

## The suggester

[frontend/src/editor/repairReference.ts](../../../frontend/src/editor/repairReference.ts) - `repairCandidates`,
best-first over three tiers (the tier order is the contract):

- equal after `normalizeTitle` (catches a hand-written "Auth Token Refresh" vs `auth-token-refresh`);
- bounded Levenshtein, limit 2, with an early row-minimum exit (catches `oauth-token-refesh`) - hand-rolled
  deliberately: no standard-library facility exists and a dependency is not warranted for a bounded loop over short
  canonical identifiers;
- prefix/substring containment, only when the contained string is at least 4 characters (catches `oauth-token` ->
  `oauth-token-refresh` without letting tiny stems match half the folder).

The candidate set is the card's `takenTitles` - the folder-wide saved titles plus the open file's live entries - so a
target renamed in another file is proposed.

## The rules that make it trustworthy

- **Propose, never apply.** A confidently-wrong repair is worse than a dangling reference: a broken link announces
  itself; a wrong link does not. Every repair is an explicit per-row click.
- **Repair edits only `relatesTo`** (re-pointing one reference, deduplicating if the entry already relates to the
  target), so the change and its undo stay minimal.
- **Absence is an answer.** A reference with no candidate shows "no similar entry found" rather than the least-bad
  match - a suggester that always suggests something cannot be trusted.

## Deliberately not included

The proposal's bulk rework (turning the selection-wide **Remove broken references** operation into a review dialog
with per-item Repair/Remove decisions) is a redesign of an existing bulk operation's UX and is left for a human call;
the card-level repair covers the everyday case.

## Tests

[frontend/src/editor/repairReference.test.ts](../../../frontend/src/editor/repairReference.test.ts) pins each tier,
the tier ordering, the no-candidate answer for a genuinely absent target, and the containment length floor.
