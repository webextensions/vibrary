---
description: TypeScript pitfalls observed in first-pass code generation - stale references, unused symbols, escape hatches
globs: ["**/*.cts", "**/*.mts", "**/*.ts"]
---

# TypeScript Gotchas - Avoid First-Pass Type Errors

These TypeScript errors recur in first-pass code. They are not autofixable; getting them right up
front avoids a typecheck round-trip.

Run `node --run test:types` - do **not** invoke `tsc` directly; the npm script encodes the intended
flags and project file. This repo is JS-first with `strict: false` ([tsconfig.json](../../tsconfig.json)) -
do not impose strict-mode fixes the checker does not require.

## "Cannot find name" - TS2304 / TS2552

- Every referenced symbol needs an import or local declaration - do not assume helpers exist
  globally.
- After renaming, verify all references - TS2552 (`Did you mean 'X'?`) usually means a stale
  reference survived the rename. Grep for the old name before saving.

## Wrong Overload from Unknown Keys - TS2769

- For library options objects, pass only documented keys - an unknown key makes the call resolve
  against the wrong overload and yields a TS2769 whose message points nowhere near the actual typo.

## Tuple Narrowing

- Destructure async results as `[err, result]` (see [error-handling.md](./error-handling.md)) -
  control-flow narrowing of `result` relies on the explicit `if (err) return ...` check.

## Stale Imports and Locals - TS6133 (`declared but never read`)

- After every edit, remove imports and locals that no longer have a use site.
- Do **not** silence with a `_` prefix unless the symbol is genuinely required by an API contract
  (e.g. a callback signature).

## Workflow

- After non-trivial edits, run `node --run test:types` once and read the **first** error before
  fixing - later errors are often cascades.
- After a typecheck fix, run `node --run eslint` too - `tsc` does not enforce ESLint-only rules
  (see [eslint-gotchas.md](./eslint-gotchas.md)).
- Do not paper over failures with `as any`, `// @ts-expect-error`, or `// @ts-ignore`. If one is
  truly unavoidable, document why in [docs/because/](../../docs/because/README.md).
