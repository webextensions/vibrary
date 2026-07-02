# 018 - Server binds every interface with unauthenticated agent-execution endpoints

- **Area**: adopting best practices / aligning behavior with what a user would expect
- **Files**: [backend/server.js](../../backend/server.js), [backend/cli.js](../../backend/cli.js),
  [docs/README.md](../README.md)
- **Status**: proposed (review only - not implemented)

## Finding

`startServer` listens without a host argument:

```js
const server = app.listen(resolvedPort, async function () { ... });
```

Node binds that to all interfaces (`::` / `0.0.0.0`). The CLI (`backend/cli.js`) offers `--port` and `--no-open`
only - there is no `--host`, so there is no way to restrict the bind, and nothing in `docs/README.md` mentions that
starting `vibrary-server` exposes the folder to the whole local network.

What is exposed is not just file browsing: the API has no authentication of any kind, and several endpoints spawn
`claude -p ... --dangerously-skip-permissions` in the served folder (see review 015). `POST /api/apply` and
`/api/run-task` accept arbitrary text in the request body and hand it to an agent that can run shell commands as the
server's user. So on a shared network (office, cafe, co-working space), anyone who can reach the machine's IP and
port can execute commands on it - no user interaction required on the host.

The LAN use case is intentional - the repo repeatedly designs for "opened over plain HTTP on a LAN address (the
phone case)" (see `randomId`/`hashContent` comments in `vibraryXmlCore.js`) - so all-interfaces binding cannot just
be removed. But today the exposure is always-on and undisclosed, rather than an explicit choice.

## Suggested improvement

- Add a `--host <address>` option to the `server` command, defaulting to `127.0.0.1`. The phone case becomes
  explicit: `vibrary server --host 0.0.0.0` (documented next to the existing examples in `docs/README.md`).
- Thread it through `startServer({ host, ... })` to `app.listen(resolvedPort, host, ...)`, and print the bound
  address in the startup line so the user can see the exposure state at a glance
  (`running at http://localhost:3000/ (bound to 127.0.0.1, serving /path)`).
- In the docs, one sentence alongside the review-015 disclosure: binding to a non-loopback address gives everyone
  on the network the same powers the UI has, including agent runs - only do it on networks you trust.
- If defaulting to loopback is considered too breaking for existing phone-case users, the minimum viable change is
  the docs sentence plus the startup line naming the bind address; but a safe-by-default bind with an explicit
  opt-in matches how comparable local dev tools (vite, webpack-dev-server, jupyter) treat the same trade-off.

## Verification

- `node --run lint`, `node --run typecheck`, and `node --run test` pass.
- `vibrary server` then `curl http://<lan-ip>:3000/api/files` from another machine fails (connection refused), while
  `curl http://localhost:3000/api/files` works; with `--host 0.0.0.0` both work.
- `vibrary server --help` documents the new flag; the invalid-value path gets the same `InvalidArgumentError`
  treatment as `parsePort`.

## Risk

Medium only in the sense of a behavior change for users who rely on the implicit LAN exposure today; the flag keeps
that one `--host` away. Code-wise the change is small and mechanical.
