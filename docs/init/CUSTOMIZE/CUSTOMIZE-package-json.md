# [`./package.json.ts`](../../../package.json.ts)

Applies to: new project (a new layer branch keeps the family identity and only adds the
dependencies/scripts its layer introduces).

`package.json.ts` is the source of truth - edit it, never `package.json` directly. Update:

- `name` - from `@webextensions/template-javascript-project` to your project name.
- `description` - to describe your project.
- `keywords` - to match your project.
- `homepage`, `repository.url`, `bugs.url` - point to your new repository.
- `author` / `license` - adjust if different from the defaults.
- `private` - the base template sets `"private": true` because nothing is published from it. Keep it
  for non-published projects; remove it (and add your publish fields - `main` / `exports` / `bin` /
  `files` / `publishConfig` as needed) if your project publishes to npm.
- `engines.node` - the base template sets the dev/tooling floor (the comment above `engines` in
  `package.json.ts` explains it; CI exercises a matrix of Node versions per
  [.github/workflows/ci.yml](../../../.github/workflows/ci.yml)). If your project publishes a
  package, set this to your consumer-facing runtime floor instead - but note that lowering it does
  not lower the tooling floor: you still develop and run the checks on the base floor.
- `dependencies` - add your project's runtime dependencies inside the marked block.

Then regenerate the manifest:

```sh
node --run housekeeping:generate-package-json
npm install   # refresh package-lock.json
```
