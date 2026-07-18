# CLAUDE.md

Vibrary is a globally-installable local web app for browsing and editing vibrary files - `reviews` / `specs` /
`tasks` / `ideas` XML files in the folder the server is started in. Express serves a prebuilt React frontend plus a
JSON API; "AI" actions shell out to the `claude` CLI headlessly. See [docs/README.md](docs/README.md),
[docs/editor.md](docs/editor.md) and [docs/vibrary-file-format.md](docs/vibrary-file-format.md).

## Commands

- `node --run lint` - eslint (flat config, eslint-config-ironplate presets)
- `node --run typecheck` - `tsc --noEmit -p frontend` plus a checkJs pass over `backend`/`bin`/`scripts`
  (`tsconfig.node.json`) - cross-module arity/shape drift against the shared core fails here
- `node --run test` - `node --test` over `*.test.js`/`*.test.ts` in `shared`, `frontend/src`, `backend`, and
  `scripts` (TypeScript tests run via Node's built-in type stripping - hence `engines` requiring Node >= 22.18)
- `node --run build` - vite build into `dist/` (served by the Express server)
- `npm start` - concurrently: build watcher + server with auto-reload (see `scripts/start-*.js`)
- `node --run dev` - vite dev server alone, proxying `/api` to a separately running server on port 3000
- All four checks (lint, typecheck, test, build) must pass before committing; `prepack` runs them all.

## Architecture

- `bin/` - `vibrary` (commander CLI, `backend/cli.js`) and `vibrary-server` (starts `backend/server.js` directly).
- `backend/` - plain-JS ESM Express app (`app.js`); grouped by feature, each folder bundling its `{ cwd }`-factory
  router, its workers, and its tests: `files/` (CRUD router `files.js`, the streaming agent router `agents.js` with
  the NDJSON `streamClaudeRoute` helper, one `runClaude*.js` per agent action (prompt builder + timeout each), and
  `vibraryFiles.js` - name validation, the path-traversal defense, and `.vibraryinclude` gating), `git/` (router,
  `runGit.js` simple-git wrappers, `runClaudeCommitMessage.js`), `search/` (router plus `searchVibrary.js` -
  entry-aware: matches parsed title/content/notes and returns per-entry indexes that the editor's highlight
  addresses directly as `specs[entryIndex]` - keep the two sides parsing the same file), `settings/` (router).
  `shared/` holds the cross-feature plumbing: `spawnClaude.js` (process lifecycle: stream-json flags, timeouts,
  abort -> process-group kill), `sendResponse.js` (the `{ status, output|errorMessage }` envelope),
  `abortOnDisconnect.js`, `resolveWithinCwd.js`, and the route test harness `testHelpers.js`.
- `frontend/` - React 19 + TypeScript + Vite + CSS modules, `src/` grouped by feature (components, CSS, hooks, and
  tests colocated): `xml/` (the type layer `vibraryXml.ts`), `activity/` (`ActivityQueueProvider.tsx` owns the
  in-memory job queue - strictly one `claude -p` job at a time; per-job transcripts live in refs surfaced via
  `useSyncExternalStore` so token streams re-render only the open detail tab; the context is split into a volatile
  state half and a referentially-stable actions half - consume the narrowest one, and any NEW queue action must read
  live state through the refs, never captured state variables: the actions bundle freezes first-render closures),
  `editor/` (SpecsEditor/SpecCard and the spec-run UI), `explorer/` (LeftPanel/Sidebar plus `useFileOperations.ts` -
  the listing/summary, every explorer file mutation, and the error banner), `git/` (source control panel), `tabs/`
  (`useOpenTabs.ts` - tab state, per-tab unsaved edits survive switching - and `useSessionRestore.ts`, per-folder
  which-tabs-were-open persistence), `settings/`, and `shared/` (dialogs, icons, generic hooks). At the root,
  `App.tsx` composes the layout and `api.ts` is the fetch layer (JSON envelope + NDJSON streaming).
- `shared/vibraryXmlCore.js` - the deliberately untyped, framework-free, isomorphic core (parse/serialize/
  hash/approval-state, plus the single `normalizeTitle` rule and the guarded `randomId`). It must keep working in
  the browser AND under plain node: `scripts/canonicalize-vibrary.js` (the git diff driver's canonicalizer) and the
  backend import it. `frontend/src/xml/vibraryXml.ts` is its hand-maintained type layer (`as`-cast re-exports).
- `.vibraryinclude` (gitignore-style patterns, `ignore` library) gates EVERYTHING: listing, create, read, save,
  rename, delete all check it.
- `scripts/` - dev launchers (`start-server.js`, `start-build.js`, `notifier.js`) and the reorder-insensitive git
  diff driver (`vibrary-diff.js` + `canonicalize-vibrary.js`, wired by `setup-git-textconv.js` via the committed
  `.gitconfig` fragment).

## Conventions

- Function expressions everywhere (`const x = function () {...}`), named exports only, `node:` prefixes, file
  extensions in imports, 4-space indent.
- Naming: `Async` suffix for backend promise-returning functions; unicorn's name-replacements rule enforces
  spelled-out names everywhere (`directory` not `dir`, `...Reference` not `...Ref` - the conflicting react-x
  ref-name rule is disabled).
- CSS modules use kebab-case class names accessed as camelCase (`localsConvention: 'camelCaseOnly'`).
- Comments explain WHY (constraints, trade-offs), often at paragraph length; match that density when editing.
- Plain HTTP on a LAN address (phone use) is a supported context: `crypto.randomUUID`/`crypto.subtle` are NOT
  guaranteed to exist - use the guarded helpers in `vibraryXmlCore.js` (e.g. `randomId`).
- Every agent invocation runs `claude -p ... --dangerously-skip-permissions` (a headless run cannot answer
  permission prompts); treat prompt text as code. The run recipes live ONCE in `spawnClaude.js` -
  `runStreamedAgentAsync` for streamed runs, `runBufferedAgentAsync` for the quick buffered helpers (title, commit
  message) - change flags/timeout policy there, not per action.
- Commits: imperative summary, detailed prose body (wrapped ~72 cols) explaining why and how it was verified.

## Packaging

- The tarball ships only `backend`, `bin`, `dist`, and the allowlisted `shared/` modules (`vibraryXmlCore.js`,
  `apiLimits.js`) - the backend imports them at RUNTIME. A new runtime import outside those paths, or a backend-reachable package left in
  devDependencies, breaks the installed package while everything still works from the repo - this has happened.
  Frontend-only libraries belong in devDependencies (vite prebuilds them into `dist/`); anything the backend or the
  shipped core resolves at runtime belongs in dependencies.
- After touching `files` or dependency placement, run `node --run smoke-test`
  (`scripts/smoke-test-package.js` - packs the tarball, installs it with `--omit=dev` outside the repo, starts the
  packed server, and hits the endpoints that exercise the runtime import graph). It also runs at the end of `prepack`
  and in CI.
