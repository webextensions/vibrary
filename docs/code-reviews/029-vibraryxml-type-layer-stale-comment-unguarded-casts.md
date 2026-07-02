# 029 - vibraryXml.ts: stale comment, and the cast layer has no drift guard

- **Area**: keeping comments truthful / protecting a known drift hazard
- **Files**: [frontend/src/vibraryXml.ts](../../frontend/src/vibraryXml.ts),
  [frontend/src/vibraryXmlCore.js](../../frontend/src/vibraryXmlCore.js)
- **Status**: proposed (review only - not implemented)

## Finding

Two related items in the typed wrapper over the untyped core:

- Stale comment (line 24):

  ```ts
  // The kinds of entry the app understands, carried per <entry type>. A file is just a container and may hold any mix;
  // only a 'spec' entry shows the "Apply this spec" action.
  ```

  Untrue since tasks got their run action: BOTH `spec` and `task` entries have one ("Apply this spec" / "Run this
  task" - see `RunActionSection`, `docs/editor.md`, and `docs/vibrary-file-format.md`, which all state it
  correctly). This wrapper file is where every frontend consumer reads the `EntryType` definition, so its comment is
  the one most likely to mislead.

- Unguarded casts. The file's whole job is pinning the untyped core's signatures with `as` casts:

  ```ts
  const parseVibraryXml = parseVibraryXmlImpl as (xml: string) => Spec[];
  const emptySpec = emptySpecImpl as (type?: EntryType) => Spec;
  ...
  ```

  An `as` cast is an unchecked promise: if the core's shape changes, TypeScript stays silent and consumers break at
  runtime. This is not hypothetical in this repo - review 011 documents `scripts/canonicalize-vibrary.js` breaking
  precisely because it assumed `parseVibraryXml` returned `{ type, entries }` while the core returns an array, and
  the failure stayed invisible. The frontend's casts institutionalize the same class of assumption with no guard.

## Suggested improvement

- Fix the comment: "...may hold any mix; only `spec` and `task` entries have a headless-agent run action ('Apply
  this spec' / 'Run this task')." - matching the wording `editor.md` already uses.
- Add a cheap drift test (the existing `vibraryXmlCore.test.js` is the natural home) that pins the core's shape the
  casts claim, e.g.: `parseVibraryXml('...')` returns an Array; `emptySpec('task').type === 'task'`;
  `serializeVibraryXml([])` is a string taking ONE argument (`serializeVibraryXml.length === 1` catches the
  arity the canonicalize script got wrong); `approvalState`/`countApprovedSpecs`/`hashContent` accept the documented
  inputs. A handful of one-line asserts turns silent cast drift into a red test.

## Verification

- `node --run lint`, `node --run typecheck`, and `node --run test` pass.
- Mutation check: changing `emptySpec`'s default or `serializeVibraryXml`'s arity in the core makes the new asserts
  fail.

## Risk

None to runtime: a comment fix plus test-only additions.
