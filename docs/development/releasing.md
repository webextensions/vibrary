# Releasing a Version

```sh
npm version patch # or minor / major
```

The `preversion` / `version` / `postversion` scripts in [`package.json.ts`](../../package.json.ts)
document the lifecycle, and
[`prepare-version.sh`](../../scripts/build-and-release/prepare-version.sh) documents what the
`version` step regenerates and stages. [CHANGELOG.md](../../CHANGELOG.md) is generated from git
history by [`auto-changelog`](https://github.com/cookpete/auto-changelog) (config in
[`.auto-changelog`](../../.auto-changelog)) during that flow - never hand-edit it; the `changelog` /
`changelog:preview` scripts cover manual runs.

## Publishing to npm

```sh
npm publish
```

- The `prepublishOnly` script (see [`package.json.ts`](../../package.json.ts)) runs the full
  `node --run test` suite on every `npm publish` - including publishes that skip `npm version` and
  its `preversion` hook. It does not run on `npm pack` or `npm install`.
- What ships is the **generated** `package.json` (from `package.json.ts`) plus the `files`
  allowlist: npm force-includes `README.md` and `LICENSE`, and `CHANGELOG.md` is listed explicitly
  because npm does not auto-include it. [`.npmignore`](../../.npmignore) is only a redundant
  denylist behind that allowlist.
- `node --run publint` lints the manifest for publish-time correctness (`main` / `exports` /
  `files` resolution); it also runs as the `publint` check in the `all-is-well` suite.
- Preview the exact tarball contents before publishing:

  ```sh
  npm pack --dry-run
  ```

  Expected on this branch: `package.json`, `README.md`, `LICENSE`, `CHANGELOG.md`, `index.js`,
  `lib/template.js` (and NOT the colocated `lib/template.test.js` - the `"!**/*.test.*"`
  negation in `files` keeps it out).
