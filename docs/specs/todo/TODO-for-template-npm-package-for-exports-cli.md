# TODO - For `template-npm-package-for-exports-cli` template

> TODOs for the `template-npm-package-for-exports-cli` template branch itself (the ESM-exports +
> CLI npm package template - see [docs/template-project/README.md](../../template-project/README.md)).
>
> Parent-branch TODOs live in
> [TODO-for-template-npm-package-for-exports.md](./TODO-for-template-npm-package-for-exports.md);
> project-specific TODOs live in [TODO.md](./TODO.md).

* Revisit `engines.node`: it is kept at the repo's dev/tooling floor (`>=24.2.0`, unchanged from
  the parent branch, for merge-cleanliness), but the real consumer floor with `commander@^15` is
  `>=22.12.0` (its `require(esm)` requirement) - decide whether this branch (and publishing forks)
  should lower it to demonstrate the consumer-floor-vs-tooling-floor split.
* Re-verify the `bin` key guidance (the command name defaults to the unscoped package name) when
  forks report friction renaming it.
