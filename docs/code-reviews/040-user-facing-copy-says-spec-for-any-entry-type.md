# 040 - UI copy still says "spec" for entries of any type

- **Area**: general cleanup of inconsistencies (user-facing terminology)
- **Files**: [frontend/src/components/SpecCard.tsx](../../frontend/src/components/SpecCard.tsx),
  [frontend/src/components/SpecsEditor.tsx](../../frontend/src/components/SpecsEditor.tsx)
- **Status**: proposed (review only - not implemented)

## Finding

The product's model moved to "entries" - a file holds a mix of `spec`/`review`/`task`/`idea` entries, and the newer
surfaces speak that language (footer "N entries", "N entries selected", "Create entries with AI", `docs/editor.md`
throughout). But a layer of older copy still says "spec" regardless of what the entry actually is:

- Confirm dialogs on every card type: "Remove this spec?" and "Remove your approval from this spec?" - shown when
  deleting or un-approving a review, task, or idea.
- The untitled fallback: `(untitled spec #3)` on a card whose type icon right next to it says "review".
- Empty states in the editor: "No specs yet. Add one to get started." and "No specs match the selected filters." -
  e.g. in `reviews.xml`, which may never contain a spec.
- Screen-reader labels: `aria-label="Spec title"`, `"Spec content"`, `"Filter specs by approval status"`,
  `"Filter specs by entry type"` (a label that contradicts itself), `"Filter specs by label"`, `"Add spec"`.

For a user working in a reviews or tasks file, the app repeatedly names their content something it is not; for
assistive-tech users the mismatch is baked into the accessible names. (Code-level names - `Spec` type, `SpecCard`,
`specs` props - are a separate, larger rename question deliberately NOT raised here; this is only about strings a
user sees or hears.)

## Suggested improvement

- Replace user-facing "spec" with "entry"/"entries" in the strings above: "Remove this entry?",
  "(untitled entry #3)", "No entries yet...", "Entry title", "Entry content", "Filter entries by ...", "Add entry".
- Where the card knows its type, the copy can be sharper for free: `value.type` is in scope in `SpecCard`, so
  "Remove this review?" costs one interpolation - but plain "entry" is already correct everywhere.
- `docs/editor.md` needs no change - it already says "entry" - which is a sign the strings, not the docs, are the
  stragglers.

## Verification

- `node --run lint`, `node --run typecheck`, and `node --run test` pass.
- `grep -rn "spec" frontend/src/components --include="*.tsx"` shows no remaining user-visible/aria string using the
  word for a generic entry (code identifiers and comments are expected to remain).
- Manual check: in a reviews file, the remove confirm, empty state, and add button all read "entry"/"review".

## Risk

None functional; string-only changes. The one judgment call is keeping code identifiers (`SpecCard`, `Spec`) as-is,
which this review recommends to keep the diff small (see the minimal-diffs convention).
