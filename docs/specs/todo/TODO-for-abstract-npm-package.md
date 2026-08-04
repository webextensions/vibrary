# TODO - For `abstract-npm-package` template base

> TODOs for the `abstract-npm-package` base branch itself (the shared base of the npm-package
> template branches - see [docs/template-project/README.md](../../template-project/README.md)).
>
> Project-specific TODOs live in [TODO.md](./TODO.md).

* Add `types` / `sideEffects` guidance (and possibly fields) when a child branch first ships
  TypeScript types or needs tree-shaking hints - deliberately absent here (see the comment above
  `main` in [package.json.ts](../../../package.json.ts)).
* Consider a CI publish workflow (e.g. `npm publish --provenance`) once a real package publishes
  from this family (the `template-npm-package-*` child branches exist now).
* Decide whether the `abstract-npm-package` note in the git branching tree should mention the
  publishing baseline - [docs/template-project/README.md](../../template-project/README.md) is
  maintained from the root base branch (`abstract-javascript-project`), so make that edit there and
  let it flow down by merge.
* Decide whether published child branches should add an npm version badge to `README.md` (this
  abstract branch deliberately keeps only the CI and MIT badges).
