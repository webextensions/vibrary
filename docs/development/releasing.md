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
