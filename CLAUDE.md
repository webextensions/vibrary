# CLAUDE.md

Vibrary is a globally-installable local web app for browsing and editing vibrary files - `reviews` / `specs` /
`tasks` / `ideas` XML files in the folder the server is started in. Express serves a prebuilt React frontend plus a
JSON API; "AI" actions shell out to the `claude` CLI headlessly. See [docs/README.md](docs/README.md),
[docs/editor.md](docs/editor.md) and [docs/vibrary-file-format.md](docs/vibrary-file-format.md).

## Commands

- `node --run lint` - eslint (flat config, eslint-config-ironplate presets)
- `node --run typecheck` - `tsc --noEmit -p frontend` plus a checkJs pass over `backend`/`bin`/`scripts`
  (`tsconfig.node.json`) - cross-module arity/shape drift against the shared core fails here
- `node --run test` - `node --test` over `*.test.js`/`*.test.ts` in `frontend/src`, `backend`, and `scripts`
  (TypeScript tests run via Node's built-in type stripping - hence `engines` requiring Node >= 22.18)
- `node --run build` - vite build into `dist/` (served by the Express server)
- `npm start` - concurrently: build watcher + server with auto-reload (see `scripts/start-*.js`)
- `node --run dev` - vite dev server alone, proxying `/api` to a separately running server on port 3000
- All four checks (lint, typecheck, test, build) must pass before committing; `prepack` runs them all.

## Architecture

- `bin/` - `vibrary` (commander CLI, `backend/cli.js`) and `vibrary-server` (starts `backend/server.js` directly).
- `backend/` - plain-JS ESM Express app (`app.js`); routers in `routes/` (files, git, search, settings) are
  factories taking `{ cwd }`. `utils/` holds the workers: `spawnClaude.js` (process lifecycle: stream-json flags,
  timeouts, abort -> process-group kill), one `runClaude*.js` per agent action (prompt builder + timeout each),
  `runGit.js` (simple-git wrappers), `vibraryFiles.js` (name validation - the path-traversal defense - and
  `.vibraryinclude` gating), `searchVibrary.js`, `sendResponse.js` (the `{ status, output|errorMessage }` envelope).
- `frontend/` - React 19 + TypeScript + Vite + CSS modules. `App.tsx` composes layout and owns file CRUD handlers;
  `useOpenTabs.ts` owns tab state (per-tab unsaved edits survive switching); `ActivityQueueProvider.tsx` owns the
  in-memory job queue (strictly one `claude -p` job at a time; per-job transcripts live in refs surfaced via
  `useSyncExternalStore` so token streams re-render only the open detail tab; the context is split into a volatile
  state half and a referentially-stable actions half - consume the narrowest one); `api.ts` is the fetch layer
  (JSON envelope + NDJSON streaming).
- `frontend/src/vibraryXmlCore.js` - the deliberately untyped, framework-free, isomorphic core (parse/serialize/
  hash/approval-state). It must keep working in the browser AND under plain node: `scripts/canonicalize-vibrary.js`
  (the git diff driver's canonicalizer) and the backend import it. `vibraryXml.ts` is its hand-maintained type
  layer (`as`-cast re-exports).
- `.vibraryinclude` (gitignore-style patterns, `ignore` library) gates EVERYTHING: listing, create, read, save,
  rename, delete all check it.
- `scripts/` - dev launchers (`start-server.js`, `start-build.js`, `notifier.js`) and the reorder-insensitive git
  diff driver (`vibrary-diff.js` + `canonicalize-vibrary.js`, wired by `setup-git-textconv.js` via the committed
  `.gitconfig` fragment).

## Conventions

- Function expressions everywhere (`const x = function () {...}`), named exports only, `node:` prefixes, file
  extensions in imports, 4-space indent.
- Naming: `Async` suffix for backend promise-returning functions; refs spelled out as `...Reference` (unicorn's
  name-replacements rule; the conflicting react-x ref-name rule is disabled).
- CSS modules use kebab-case class names accessed as camelCase (`localsConvention: 'camelCaseOnly'`).
- Comments explain WHY (constraints, trade-offs), often at paragraph length; match that density when editing.
- Plain HTTP on a LAN address (phone use) is a supported context: `crypto.randomUUID`/`crypto.subtle` are NOT
  guaranteed to exist - use the guarded helpers in `vibraryXmlCore.js` (e.g. `randomId`).
- Every agent invocation runs `claude -p ... --dangerously-skip-permissions` (a headless run cannot answer
  permission prompts); treat prompt text as code.
- Commits: imperative summary, detailed prose body (wrapped ~72 cols) explaining why and how it was verified.

## Active work

`docs/code-reviews/` holds numbered review findings being implemented one commit at a time; each implementation
commit deletes (or narrows) its review file. Keep this file truthful as those changes land.
