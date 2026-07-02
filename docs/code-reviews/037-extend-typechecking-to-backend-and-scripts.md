# 037 - Backend and scripts are outside typechecking; checkJs would have caught the dead diff feature

- **Area**: adopting best practices for the stack / preventing a proven drift class
- **Files**: [tsconfig.json](../../tsconfig.json), [frontend/tsconfig.json](../../frontend/tsconfig.json),
  [package.json](../../package.json)
- **Status**: proposed (review only - not implemented)

## Finding

The `typecheck` script runs `tsc --noEmit -p frontend`, and the root tsconfig's `include` is `["frontend"]` - so
`backend/**`, `scripts/**`, and `bin/**` (all plain JS) receive no type analysis at all. This is not hypothetical
cost: review 011 documents that `scripts/canonicalize-vibrary.js` has been calling the shared core with the wrong
shapes, silently killing the reorder-insensitive git-diff feature. Running the compiler over that file proves the
gap - with `--checkJs` (and `noImplicitAny` off), tsc reports immediately:

```
scripts/canonicalize-vibrary.js(44,59): error TS2554: Expected 0-1 arguments, but got 2.
scripts/canonicalize-vibrary.js(50,42): error TS2554: Expected 0-1 arguments, but got 2.
```

- exactly the `serializeVibraryXml(fileType, [spec])` arity bug from review 011, caught statically with zero
annotations. (The remaining diagnostics in the probe run are just missing `@types/node` wiring - already a
devDependency - not real errors.)

The same protection would watch every backend consumer of the shared core (`routes/files.js` imports `ENTRY_TYPES`
from `frontend/src/vibraryXmlCore.js`) and the express route plumbing generally.

## Suggested improvement

- Add a second project, e.g. `tsconfig.node.json` at the root: `allowJs` + `checkJs`, `noEmit`,
  `types: ["node"]`, `include: ["backend", "scripts", "bin"]`, with `noImplicitAny: false` initially so the
  untyped-but-consistent code passes without a JSDoc-annotation campaign - the win is cross-module signature
  checking (arity, return shapes, property names), which needs no annotations.
- Extend the script: `"typecheck": "tsc --noEmit -p frontend && tsc --noEmit -p tsconfig.node.json"` - prepack
  already runs typecheck, so drift in scripts/backends fails the publish gate from then on.
- Ratchet later if wanted (per-file `// @ts-check` strictness or JSDoc types on the core's exports); the base tier
  above is the small, high-value step.

## Verification

- With the new project in place and review 011's fix NOT applied, `node --run typecheck` fails on the two TS2554
  lines above - demonstrating the guard catches the known bug. After 011's fix, the whole tree typechecks clean.
- `node --run lint` and `node --run test` unaffected.

## Risk

Low. `noEmit` analysis only; the initial permissive strictness keeps the diff to a tsconfig, a script line, and
whatever real mismatches it surfaces (which are the point).
