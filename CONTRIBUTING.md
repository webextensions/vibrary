# Contributing

Thanks for your interest in contributing. This document covers the local setup; the conventions
contributors and agents follow are summarized in [AGENTS.md](AGENTS.md), and the documentation
index is [docs/README.md](docs/README.md).

## Prerequisites

- Node.js matching the version in [.nvmrc](.nvmrc). Use `nvm use` to switch to it.
- npm (ships with Node).

## Getting started

```sh
git clone <repository-url>
cd <repository-directory>
nvm use
npm install        # also installs the git hooks via the "prepare" script
node --run test    # run the full check suite
```

## Project layout

The project's layout and overview live in its [README.md](README.md); the documentation index is
[docs/README.md](docs/README.md). One rule applies everywhere: `package.json` is generated from
[package.json.ts](package.json.ts) - never hand-edit it (see "Source of truth:
package.json.ts" in [AGENTS.md](AGENTS.md)).

## Before you commit

Run the full check suite (the git hooks run it for you, but run it yourself first):

```sh
node --run test
```

What it runs and how it is configured:
[docs/development/health-checks.md](docs/development/health-checks.md).

## Keeping a fork in sync with the template

If your project was created from this template, common improvements flow in via the `template`
branch:

```sh
node --run template:merge-to-main
```

See [docs/template-project/template-sync.md](docs/template-project/template-sync.md).

## Reporting security issues

See [SECURITY.md](SECURITY.md).
