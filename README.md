# template-npm-package-for-exports-cli

[![CI](https://github.com/webextensions/template-javascript-project/actions/workflows/ci.yml/badge.svg)](https://github.com/webextensions/template-javascript-project/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

This is the **`template-npm-package-for-exports-cli`** branch - a directly-forkable template for
creating npm packages with ESM exports and a CLI, from this repository's family of JavaScript
project templates maintained as git branches. On top of the `template-npm-package-for-exports`
library layout (core logic in [lib/](./lib/) re-exported by the thin [index.js](./index.js) entry,
`./lib/*` deep imports, matching tests, plus the `abstract-npm-package` publishing baseline and
the shared ESLint/Vitest/health-check/template-sync tooling) it adds the CLI layer: a
[commander](https://www.npmjs.com/package/commander)-based wrapper in [cli.js](./cli.js) wired via
the `bin` entry, with a [test/cli.test.js](./test/cli.test.js) suite. Replace the stub with your
package's real API. For the fork/setup workflow, see
[docs/template-project/README.md](./docs/template-project/README.md).

## Usage

As a library (replace `templateJavascriptProject` with your package's real API):

```js
import { templateJavascriptProject } from '@webextensions/template-javascript-project';

templateJavascriptProject();      // "Hello, world!"
templateJavascriptProject('Ada'); // "Hello, Ada!"
```

Individual `lib/` modules can also be deep-imported via the `./lib/*` subpath in `exports`:

```js
import { templateJavascriptProject } from '@webextensions/template-javascript-project/lib/template.js';
```

As a CLI (the `bin` entry maps the command to [cli.js](./cli.js)):

```sh
npx @webextensions/template-javascript-project        # Hello, world!
npx @webextensions/template-javascript-project Ada    # Hello, Ada!
npx @webextensions/template-javascript-project Ada -u # HELLO, ADA!
npx @webextensions/template-javascript-project --help
```

> The reusable logic lives in [lib/](./lib/) (see [lib/template.js](./lib/template.js));
> `index.js` is a thin public-API entry that just re-exports it, and `cli.js` only parses
> arguments and delegates to it. If your package has no CLI, remove `cli.js`,
> [test/cli.test.js](./test/cli.test.js), the `bin` field, and the `commander` dependency. The
> colocated [lib/template.test.js](./lib/template.test.js) stays out of the published tarball via
> the `"!**/*.test.*"` negation in the `files` allowlist.

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
