# 034 - Title normalization: manual edit and AI Populate produce different slugs, despite a comment claiming they mirror

- **Area**: tightening logic (one rule, two implementations) / comment truthfulness
- **Files**: [frontend/src/components/SpecCard.tsx](../../frontend/src/components/SpecCard.tsx),
  [backend/utils/runClaudeTitle.js](../../backend/utils/runClaudeTitle.js),
  [frontend/src/vibraryXmlCore.js](../../frontend/src/vibraryXmlCore.js)
- **Status**: proposed (review only - not implemented)

## Finding

The same field - an entry's hyphenated title - is normalized by two different rules depending on how it is set:

- Manual typing, on blur (`SpecCard.tsx` ~line 255):

  ```ts
  blurEvent.target.value.trim().toLowerCase().replaceAll(/\s+/g, '-')
  ```

  Only whitespace becomes hyphens; punctuation survives. "Fix: API (v2)!" -> `fix:-api-(v2)!`.

- AI Populate, backend `slugify()` (`runClaudeTitle.js` ~line 22):

  ```js
  firstLine.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/^-+|-+$/g, '')
  ```

  Everything non-alphanumeric collapses to single hyphens, trimmed at the ends. The same text -> `fix-api-v2`.

The backend function's comment claims "Mirrors the editor's own onBlur title normalization" - it does not, and the
divergence is user-visible: the same conceptual title yields different strings depending on whether it was typed or
populated, `relatesTo` references (exact string matches on titles) can then point at a variant that the other
affordance would never produce, and `docs/vibrary-file-format.md`'s description ("a hyphenated identifier ... for
example `sky-is-blue`") reads as if the strict a-z0-9 form were the rule.

Note the `-copy` suffix path (duplicate) and `emptySpec` don't normalize at all, which is fine - they inherit
already-normalized titles - but it means the blur handler and slugify are the only two gates, and they disagree.

## Suggested improvement

- Pick one rule - the stricter slugify form matches the documented examples and what the AI path already produces -
  and put it in the shared core (`vibraryXmlCore.js`, e.g. `normalizeTitle()`, exported like `hashContent`), since
  the core is deliberately isomorphic (browser + node) and the backend already imports from it elsewhere
  (`ENTRY_TYPES` in `routes/files.js`).
- Use it from both `SpecCard`'s onBlur and `runClaudeTitle.slugify` (which can keep its take-first-line behavior
  and delegate the character work).
- Update the `runClaudeTitle` comment to say it USES the shared normalization rather than "mirrors" one - making
  the claim true by construction.
- `docs/editor.md`'s line "normalized to a hyphenated form (lowercase, whitespace -> `-`)" should say punctuation
  collapses too, once it does.

## Verification

- `node --run lint`, `node --run typecheck`, and `node --run test` pass; a small unit test for `normalizeTitle`
  (the core's test file already exists) pins the rule.
- Manual check: type "Fix: API (v2)!" as a title and blur - it becomes `fix-api-v2`, identical to what Populate
  would derive for that content.

## Risk

Low. Existing titles on disk are untouched (normalization only runs on edit); the only behavior change is stricter
cleanup of newly typed titles.
