# 001 - Extract duplicated route helpers into backend/utils

- **Area**: modularising / extracting shared helpers
- **Files**: [backend/routes/files.js](../../backend/routes/files.js),
  [backend/routes/git.js](../../backend/routes/git.js)
- **Status**: proposed (review only - not implemented)

## Finding

Two non-trivial helpers are duplicated verbatim between the files router and the git router:

- `resolveWithinCwd(name)` - resolves a name against the served folder and returns `null` when the path escapes it.
  Defined in `backend/routes/files.js` (around line 40) and again in `backend/routes/git.js` (around line 14). The
  git copy's own comment admits the duplication: "Mirrors the guard in the files router."
- `abortOnDisconnect(request, response)` - wires a client disconnect to an `AbortController` so a long-running
  `claude -p` child is killed when the browser aborts its fetch. Defined in `backend/routes/files.js` (around line
  52) and again in `backend/routes/git.js` (around line 37), again with a comment saying it works "for the same
  reason the files router does".

Both helpers encode subtle, security- or correctness-relevant behavior:

- `resolveWithinCwd` is a path-traversal defense. If one copy is ever hardened (for example around symlinks or
  case-insensitive filesystems) and the other is not, the two routers silently diverge in their security posture.
- `abortOnDisconnect` encodes a non-obvious Express detail (listen on the response `close`, not the request, because
  Express drains the request body up front). A future fix to that logic must currently be applied twice.

## Suggested improvement

- Move `resolveWithinCwd` into a small shared module, e.g. `backend/utils/resolveWithinCwd.js`, taking `(cwd, name)`
  and keeping the existing comment about it being a defense-in-depth guard.
- Move `abortOnDisconnect` into e.g. `backend/utils/abortOnDisconnect.js`, keeping the explanatory comment about
  response-`close` vs request-`close` in the one shared place.
- Import both from the two routers and delete the local copies. No behavior change intended.

## Verification

- `node --run lint`, `node --run typecheck`, and `node --run test` all pass after the extraction.
- Manual spot check: staging a file from the Source Control panel and cancelling a running generate/apply still
  behave as before (child process killed on cancel; paths outside the folder still rejected with 400).

## Risk

Low. Pure code motion of two self-contained functions; both call sites already treat them as black boxes.
