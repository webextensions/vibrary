# 031 - start-server's build wait times out silently and serves a missing/half-built dist

- **Area**: improving log messages so failures are diagnosable / dev-tooling edge cases
- **Files**: [scripts/start-server.js](../../scripts/start-server.js)
- **Status**: proposed (review only - not implemented)

## Finding

Under `npm start`, the server script waits for the concurrent build before listening:

```js
const waitForBuild = async function () {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
        try {
            await access('dist/index.html');
            return;
        } catch {
            await delay(100);
        }
    }
};
```

Two rough edges:

- **Silent give-up.** When the deadline passes (cold first build on a slow machine, a build that failed outright,
  or `node --run start:server` run alone without the build half), the function just returns: the server starts,
  the browser auto-opens (first run of the session), and the user gets a 404/blank page or a stale previous build,
  with nothing in the terminal explaining that the wait was abandoned. A failed build's own error is interleaved in
  concurrently's output, but the server side actively claims "running at <url>" as if all were well.
- **Weak readiness signal.** `dist/index.html` existing does not mean the build finished - it can be a LEFTOVER
  from the previous build (the common case: any second `npm start` passes the check instantly while the fresh build
  is still running, so the "wait" only ever works on a clean clone). Serving mid-build risks an index.html whose
  hashed asset files are just being replaced.

## Suggested improvement

- Log the abandonment: after the deadline, print a clear line -
  `dist/index.html not found after 10s; starting anyway (is "start:build" running?)` - so the blank-page state is
  self-explanatory from the terminal.
- Strengthen the signal cheaply: `scripts/start-build.js` already knows exactly when a build completes (its
  `announce()`); having it touch a marker (e.g. `dist/.build-complete`, deleted at build start) and having
  `waitForBuild` wait for THAT makes the wait correct for rebuilds too, not just first builds. Both scripts are in
  the same repo and already share `notifier.js`, so the coordination point is natural.
- Optional tidy-up in the same file: the per-session `vibrary-start-<ppid>.marker` files written to `tmpdir()` are
  never deleted; they are tiny, but a `try { rmSync }` of markers older than a day (or keying by boot id) would stop
  the accumulation.

## Verification

- `node --run lint` passes.
- Manual check: run `node --run start:server` without the build running in an empty `dist/` - after ~10s the new
  warning appears and the server still starts. With the marker approach, a second `npm start` does not serve until
  the fresh rebuild announces completion.

## Risk

Low. Dev-launcher only; the published package's `vibrary-server` path does not use this script.
