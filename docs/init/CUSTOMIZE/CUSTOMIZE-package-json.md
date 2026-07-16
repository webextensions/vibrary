# [`./package.json.ts`](../../../package.json.ts)

Applies to: new project (a new layer branch keeps the family identity and only adds the
dependencies/scripts its layer introduces).

`package.json.ts` is the source of truth - edit it, never `package.json` directly. Update:

- `name` - from `@webextensions/template-javascript-project` to your project name.
- `description` - to describe your project.
- `keywords` - to match your project.
- `homepage`, `repository.url`, `bugs.url` - point to your new repository.
- `author` / `license` - adjust if different from the defaults.
- Publish fields - this branch ships a publishable manifest: `publishConfig` (`"access": "public"`
  for scoped packages), `main` / `exports` (the `index.js` entry plus `./lib/*` deep imports),
  `bin` (this branch's CLI layer - rename the key to your command name; it maps to
  [cli.js](../../../cli.js)), and the `files` allowlist (`index.js`, `cli.js`, `lib/` with a
  `"!**/*.test.*"` negation keeping the colocated tests out of the tarball, and `CHANGELOG.md` -
  listed explicitly because npm does not auto-include it;
  [.npmignore](../../../.npmignore) is only a redundant denylist behind it). A new project points
  them at its real entry points and updates `files` to what it ships; if your package has no CLI,
  drop `bin`, `cli.js` (from `files` and the repo) and the `commander` dependency. If your project
  is NOT published to npm, add `"private": true` and optionally drop these fields plus the
  `publint` script/check.
- `engines.node` - the advertised Node floor (consumer-facing when the manifest is published); the
  inline note on the value line in `package.json.ts` states this branch's derivation (here
  `commander@^15`'s technical minimum: `>=22.12.0`, for its `require(esm)` usage). Set it to your
  project's own floor - but note that changing it does not change the dev/tooling floor: you still
  develop and run the checks on the pinned Node in [.nvmrc](../../../.nvmrc) (CI matrix per
  [.github/workflows/ci.yml](../../../.github/workflows/ci.yml)).
- `dependencies` - add your project's runtime dependencies inside the marked block.

Then regenerate the manifest:

```sh
node --run housekeeping:generate-package-json
npm install   # refresh package-lock.json
```
