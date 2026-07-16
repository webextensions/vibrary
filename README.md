# template-javascript-project

[![CI](https://github.com/webextensions/template-javascript-project/actions/workflows/ci.yml/badge.svg)](https://github.com/webextensions/template-javascript-project/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

This is the **`abstract-npm-package`** branch - the shared base for the npm-package templates in
this repository's family of JavaScript project templates maintained as git branches. On top of the
`abstract-javascript-project` baseline (ESM, ESLint, Vitest, EditorConfig, `package.json` generated
from `package.json.ts`, a health-check suite wired into git hooks, and a template-sync merge
workflow) it adds the npm publishing baseline: a publishable manifest (`main` / `exports` /
`files` / `publishConfig`), a `publint` health check, a `prepublishOnly` test gate, and a
placeholder entry point (`index.js`) that the template branches (for example
`template-npm-package-for-exports`) replace with real source. Fork projects from a
`template-npm-package-*` branch, not from this abstract branch.

## Where to look

- **Vision and the git branching tree** -
  [docs/template-project/README.md](./docs/template-project/README.md)
- **Documentation index (commands, health checks, releases, template sync)** -
  [docs/README.md](./docs/README.md)
- **Customizing a new template/project forked from this branch** -
  [docs/init/CUSTOMIZE/README.md](./docs/init/CUSTOMIZE/README.md)
- **Local setup, style and commit conventions** - [CONTRIBUTING.md](./CONTRIBUTING.md)
- **Agent-facing guide** (Claude Code, Cursor, Codex, ...) - [AGENTS.md](./AGENTS.md)

## Security

See [SECURITY.md](./SECURITY.md) for how to report vulnerabilities privately.

## License

[MIT](./LICENSE)
