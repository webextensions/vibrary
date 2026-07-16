# Syncing Template Updates into a Forked Project

Common improvements are committed on the `template` branch and merged into each forked project's
`main` (branching vision and tree: [README.md](./README.md)). From inside a forked project, with a
clean working tree:

```sh
# Bring template -> main, auto-resolving package.json / package-lock.json conflicts, then push
node --run template:merge-to-main
```

If a merge is risky, find the newest template commit that merges cleanly *and* passes tests first:

```sh
node --run template:find-safe-merge-commit
# then, e.g.:
git merge <reported-commit> --no-edit
```

Which conflicts get auto-resolved (and how to handle the rest) is documented in the two scripts'
header comments:
[`merge-template-to-main.sh`](../../scripts/branching/merge-template-to-main.sh) and
[`find-safe-template-merge-commit.sh`](../../scripts/branching/find-safe-template-merge-commit.sh).
