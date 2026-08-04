# vibrary

[![CI](https://github.com/webextensions/vibrary/actions/workflows/ci.yml/badge.svg)](https://github.com/webextensions/vibrary/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

Vibrary - a vibe-coding assistant. Work in progress: the API below is still the hello-world stub
from the [template-npm-package-for-exports-cli](./docs/template-project/README.md) template this
project is forked from (ESM exports + CLI, with the shared ESLint/Vitest/health-check/template-sync
tooling).

## Usage

As a library:

```js
import { vibrary } from 'vibrary';

vibrary();      // "Hello, world!"
vibrary('Ada'); // "Hello, Ada!"
```

Individual `lib/` modules can also be deep-imported via the `./lib/*` subpath in `exports`:

```js
import { vibrary } from 'vibrary/lib/template.js';
```

As a CLI (the `bin` entry maps the command to [cli.js](./cli.js)):

```sh
npx vibrary        # Hello, world!
npx vibrary Ada    # Hello, Ada!
npx vibrary Ada -u # HELLO, ADA!
npx vibrary --help
```

> The reusable logic lives in [lib/](./lib/) (see [lib/template.js](./lib/template.js));
> `index.js` is a thin public-API entry that just re-exports it, and `cli.js` only parses
> arguments and delegates to it. The colocated [lib/template.test.js](./lib/template.test.js)
> stays out of the published tarball via the `"!**/*.test.*"` negation in the `files` allowlist.

## Where to look

- **Vision and the git branching tree of the template family** -
  [docs/template-project/README.md](./docs/template-project/README.md)
- **Documentation index (commands, health checks, releases, template sync)** -
  [docs/README.md](./docs/README.md)
- **Customization checklist for this fork** -
  [docs/init/CUSTOMIZE/README.md](./docs/init/CUSTOMIZE/README.md)
- **Local setup, style and commit conventions** - [CONTRIBUTING.md](./CONTRIBUTING.md)
- **Agent-facing guide** (Claude Code, Cursor, Codex, ...) - [AGENTS.md](./AGENTS.md)

## Security

See [SECURITY.md](./SECURITY.md) for how to report vulnerabilities privately.

## License

[MIT](./LICENSE)
