# Why prepack strips `preinstall` instead of migrating the Node gate to `prepare`

The published manifest must not carry install-family scripts (`preinstall` / `install` /
`postinstall`): npm runs them from an installed dependency on every consumer's machine and flags
the package with `hasInstallScript` - while the file `preinstall` points at
([scripts/npm-run-scripts/preinstall.sh](../../scripts/npm-run-scripts/preinstall.sh)) lives under
`scripts/`, which the `files` allowlist excludes from the tarball. Shipping the script entry would
therefore break consumer installs outright, and even a shipped script would wrongly impose this
repo's `.nvmrc` on consumers.

The fix chosen: keep `preinstall` for development and strip it from the manifest at pack time -
`prepack` regenerates `package.json` from `package.json.ts` and deletes the install-family scripts
(`npm pkg delete`), `postpack` regenerates to restore. The `prepack-strip` health check asserts the
strip list covers every install-family script (it is static by design: the suite runs checks
concurrently, so a real `npm pack` inside a check would mutate `package.json` while sibling checks
read it).

Alternatives rejected:

- **Migrate the gate to `prepare`** (`prepare` never runs for registry consumers): loses the
  fail-fast property - `preinstall` runs BEFORE the dependency tree is built, so a wrong active
  Node never builds `node_modules` at all; with `prepare` the failure comes after a full install
  with the wrong Node, wasting the install and risking native addons compiled against the wrong
  ABI that a plain re-run does not rebuild.
- **`clean-publish`**: avoids mutating the working tree (publishes from a temp dir) but wraps the
  publish command itself, adds a devDependency, and does not cover `npm pack` previews or
  git-dependency installs.
- **A publish mode in `package-cjson`**: architecturally cleanest (one generator owns all manifest
  writing) but blocks this repo on cross-repo work in that package.

Accepted trade-off: a pack that aborts between `prepack` and `postpack` leaves a stripped
`package.json` on disk; the `pkg-json-sync` check then fails loudly with the standard fix
(`node --run housekeeping:generate-package-json`), and the next `prepack` self-heals by
regenerating first.

This workaround becomes unnecessary if npm ever gains first-class publish-time manifest overrides
(e.g. a `publishConfig`-style way to omit scripts from the packed manifest).
