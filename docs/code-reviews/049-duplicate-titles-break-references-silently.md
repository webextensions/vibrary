# 049 - Titles are cross-file identifiers, but nothing detects duplicates

- **Area**: missed edge case in the data model's own invariant
- **Files**: [frontend/src/components/SpecCard.tsx](../../frontend/src/components/SpecCard.tsx),
  [frontend/src/api.ts](../../frontend/src/api.ts),
  [docs/vibrary-file-format.md](../vibrary-file-format.md)
- **Status**: proposed (review only - not implemented)

## Finding

The format doc gives titles identifier semantics: "a hyphenated identifier for the entry ... Other entries
reference it by this value in their `relatesTo`." The app builds real behavior on that - `relatesTo` chips resolve
by exact title, the "Relates to" option list is title-based, chip clicks navigate via a title index.

Yet nothing anywhere enforces or even surfaces uniqueness:

- The title input (`SpecCard.tsx`) normalizes on blur but performs no collision check against the file or the
  workspace; two entries can silently share a title.
- `loadTitleIndex()` (`api.ts`) hides the problem rather than reporting it: `seen.has(spec.title)` drops every
  duplicate after the first, and since files resolve in PARALLEL, which occurrence wins is nondeterministic between
  reloads (review 025 notes this in passing). A `relatesTo` chip pointing at a duplicated title can therefore
  navigate to a different entry after a refresh than it did before.
- The parts of the app that CREATE titles do try to avoid collisions (Duplicate appends `-copy`; the AI generate
  prompt demands "distinct from the existing entries"), which shows the invariant is understood - it is just never
  checked where a human can break it.

So the one integrity rule the format declares is maintained by convention only, and its failure mode is silent,
nondeterministic navigation.

## Suggested improvement

Proportionate, not draconian - duplicates should warn, not block (files are also edited outside the app):

- In the editor, mark a card whose title collides within the OPEN file (the cheap, local check: `specs` is in
  memory) - e.g. a small warning icon/text by the title, styled like the existing stale-approval affordance.
  Workspace-wide collisions can reuse `titleIndex`, which App already holds, for the same warning at lower
  confidence (the index refreshes on save).
- Make `loadTitleIndex`'s dedupe deterministic regardless of fetch order (sort or process files in listing order)
  so chip navigation is at least stable - a two-line change worth doing even without the warning UI.
- Document the collision behavior in `vibrary-file-format.md` ("titles should be unique across the folder;
  references resolve to one arbitrary entry when duplicated") until/unless the warning ships.

## Verification

- `node --run lint`, `node --run typecheck`, and `node --run test` pass.
- Manual check: give two entries the same title in one file - both cards show the duplicate warning; fixing one
  clears it. With duplicates across two files, chip navigation targets the same entry on every reload.

## Risk

Low. Warnings and a deterministic sort; no save-path or format changes.
