# template-javascript-project

[![CI](https://github.com/webextensions/template-javascript-project/actions/workflows/ci.yml/badge.svg)](https://github.com/webextensions/template-javascript-project/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

This is the **`abstract-javascript-project`** branch - the root base of a small family of
ready-to-use JavaScript project templates maintained as git branches in this repository. It carries
the shared baseline every template builds on (ESM, ESLint, Vitest, EditorConfig, `package.json`
generated from `package.json.ts`, a health-check suite wired into git hooks, and a template-sync
merge workflow) but ships no runnable source code of its own - the template branches (for example
`template-npm-package-for-exports`) add that.

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
