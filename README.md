# template-npm-package-for-exports

[![CI](https://github.com/webextensions/template-javascript-project/actions/workflows/ci.yml/badge.svg)](https://github.com/webextensions/template-javascript-project/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

This is the **`template-npm-package-for-exports`** branch - a directly-forkable template for
creating npm packages with ESM exports, from this repository's family of JavaScript project
templates maintained as git branches. On top of the `abstract-npm-package` publishing baseline
(publishable manifest generated from `package.json.ts`, `publint` health check, `prepublishOnly`
test gate, `.npmignore` backstop, plus the shared ESLint/Vitest/health-check/template-sync
tooling) it ships a working library layout: core logic in [lib/](./lib/) re-exported by the thin
[index.js](./index.js) entry, `./lib/*` deep imports, and matching tests. Replace the stub with
your package's real API. For the fork/setup workflow, see
[docs/template-project/README.md](./docs/template-project/README.md).

## Usage

As a library (replace `templateNpmPackage` with your package's real API):

```js
import { templateNpmPackage } from '@webextensions/template-npm-package-for-exports';

templateNpmPackage();      // "Hello, world!"
templateNpmPackage('Ada'); // "Hello, Ada!"
```

Individual `lib/` modules can also be deep-imported via the `./lib/*` subpath in `exports`:

```js
import { templateNpmPackage } from '@webextensions/template-npm-package-for-exports/lib/template.js';
```

> The reusable logic lives in [lib/](./lib/) (see [lib/template.js](./lib/template.js));
> `index.js` is a thin public-API entry that just re-exports it. The colocated
> [lib/template.test.js](./lib/template.test.js) stays out of the published tarball via the
> `"!**/*.test.*"` negation in the `files` allowlist.

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
