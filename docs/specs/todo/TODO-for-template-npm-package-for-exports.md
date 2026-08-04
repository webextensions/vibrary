# TODO - For `template-npm-package-for-exports` template

> TODOs for the `template-npm-package-for-exports` template branch itself (the ESM-exports npm
> package template - see [docs/template-project/README.md](../../template-project/README.md)).
>
> Project-specific TODOs live in [TODO.md](./TODO.md).

* Re-verify the `"!**/*.test.*"` negation in the `files` allowlist when the npm major version
  changes - the colocated tests staying out of the tarball depends on it (guarded today by
  `npm pack --dry-run` and the `publint` health check).
* Decide whether forks that actually publish should add an npm version badge to `README.md` (this
  template keeps only the CI and MIT badges because the template itself is not published).
