# CI: GitHub Actions checks workflow

[.github/workflows/checks.yml](../../.github/workflows/checks.yml) runs the project's four documented checks - `node
--run lint`, `node --run typecheck`, `node --run test`, `node --run build` - plus the packaged-tarball smoke test
(`node --run smoke-test`, see [packaged-tarball-smoke-test.md](packaged-tarball-smoke-test.md)) on every push to
`main` and on every pull request.

## Why

The suite was already enforced locally (husky: lint at pre-commit, all four at pre-push) and at publish time
(`prepack`), but local hooks are advisory - `--no-verify`, a clone that never ran `npm install`, a GitHub web-UI edit,
or a fork PR all bypass them - and nothing marked commits green or red on GitHub. The workflow reuses the exact
`package.json` scripts, so there is one definition of "the checks".

## Design choices

- Node matrix of `22.18.0` and `24`: the engines floor is where the engines-sensitive behavior actually bites (native
  type stripping for `.test.ts` files, `toSorted`, global fetch), while `.nvmrc` pins the dev version - testing only
  the dev version would pass code that breaks for a floor-compliant user.
- The four steps stay separate (not `prepack`) so a failure names the phase in the job summary.
- `npm ci` respects the committed lockfile.
- Deliberately minimal: no separate lint/test jobs (the suite is fast) and no publishing automation.
