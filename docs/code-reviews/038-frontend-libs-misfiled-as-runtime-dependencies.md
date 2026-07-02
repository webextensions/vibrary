# 038 - Three frontend-only libraries are misfiled as runtime dependencies

- **Area**: general cleanup / dependency hygiene of the published package
- **Files**: [package.json](../../package.json)
- **Status**: proposed (review only - not implemented)

## Finding

The published package ships a PREBUILT frontend (`dist/` in the `files` allowlist); at runtime the server imports
only backend code. Accordingly, the frontend stack (react, react-dom, react-select, react-toastify, streamdown,
@rjsf/*, ...) correctly lives in `devDependencies` - it is compiled into `dist/` by vite and never resolved at
runtime. Three packages break that rule. Verified by mapping every runtime `dependencies` entry to its import
sites:

- `re-resizable` - imported only by `frontend/src/components/LeftPanel.tsx`
- `react-syntax-highlighter` - imported only by `frontend/src/components/RawXmlView.tsx` (and its ambient d.ts)
- `helpmate` - imported only by `frontend/src/confirmDialog.ts` and `frontend/src/promptDialog.ts`

No file under `backend/`, `bin/`, or `scripts/` references any of them. Every other `dependencies` entry
(commander, compression, express, get-port, glob, ignore, open, simple-git) resolves to real backend imports.

Consequence: each `npm install -g vibrary` (or dependency install) downloads and stores these packages for nothing -
`react-syntax-highlighter` in particular drags in the refractor/prismjs grammar tree, one of the heavier frontend
subtrees in the lockfile. It also misleads readers auditing the runtime surface: the dependency list is the first
place one looks to see what the server can touch.

## Suggested improvement

- Move `re-resizable`, `react-syntax-highlighter`, and `helpmate` from `dependencies` to `devDependencies`
  (keeping `@types/react-syntax-highlighter` where it already is, in dev).
- Sanity-guard afterwards: `npm pack` + install the tarball into a scratch dir + `vibrary-server` starts and serves
  the UI - proving nothing at runtime resolves the moved packages.

## Verification

- `node --run lint`, `node --run typecheck`, `node --run test`, and `node --run build` pass (the build resolves
  devDependencies, so bundling is unaffected).
- The tarball-install smoke test above; additionally
  `grep -rn "re-resizable\|react-syntax-highlighter\|helpmate" backend bin scripts` stays empty.
- `npm install --omit=dev` in the packed tarball's directory is measurably smaller (fewer packages in the tree).

## Risk

Low. The only way this could break is a runtime import of one of the three outside `frontend/`, which the grep
sweep rules out; the smoke test covers the remaining case of an indirect resolution.
