---
name: running-the-project
description: Use when asked to run, start, launch, serve, or demo this project, or to see a change working in the real app - on this branch that is the CLI (cli.js), so this skill covers how to invoke it, what success looks like, and what forks must replace.
---

# Running the Project

## The runnable thing here is the CLI

`template-npm-package-for-exports-cli` adds a CLI (`cli.js`, wired as the `bin` entry) on top of the ESM-exports
library baseline: `cli.js` parses arguments with commander and delegates to the library functions re-exported by
`index.js` (core logic lives in `lib/`). There is no server, UI, or extension - the CLI is a one-shot command that
prints and exits, so there is no port, URL, or process to keep alive.

## Running it

- `node --run start` - runs the CLI with no arguments (`node cli.js`). Success signal: it prints the default greeting
  `Hello, world!` and exits 0.
- `node cli.js <name> [--uppercase]` - exercise the actual arguments, for example `node cli.js Priyank --uppercase`
  prints `HELLO, PRIYANK!`.
- `node cli.js --help` / `node cli.js --version` - commander's generated usage and the version from `package.json`.
- No prerequisites beyond `npm install` (no database, env file, or build step). The `bin` name resolves only after the
  package is installed or linked; run `cli.js` through `node` locally instead.

## What else "running" means here

- `node --run test` - the full health-check suite, including `publint`, which proves the publishable manifest
  (`main` / `exports` / `bin` / `files`) resolves.
- `node --run test:optimize-for-change` - change-aware run for fast local iteration.
- The CLI and the exported API are covered by the Vitest suite (`test/cli.test.js`, `test/index.test.js`,
  `lib/template.test.js`).
- Everything else executable is a documented `package.json` script (generated from `package.json.ts`, where each script
  carries a comment explaining it). Read that file rather than guessing.

If a task needs a first-time workstation setup, that is `node --run setup`.

## Descendant branches and forks: replace the section above

This file is branch-aware by design. A `template-` branch or a fork whose runnable app differs from the one above
REPLACES the sections above with its own launch instructions - commands, ports/URLs, prerequisites (database, env
files, build step), and how to tell it started successfully. Overwrite them; do not append a second "how to run" next to a stale
one that says there is nothing to run.

Keep this section itself, so the next branch down the family inherits the same instruction.
