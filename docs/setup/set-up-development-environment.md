# Set Up the Development Environment

Prerequisites and first-run steps for working on this project. Links point to the sources of truth
instead of copying values from them.

## Prerequisite software

- `Linux` (the tooling assumes a unix environment; shell scripts use `bash`)
- `Git`
- `nvm` - to install and switch to the Node.js version this project pins
- `Visual Studio Code` (or a VS Code-based IDE), with the extensions recommended in
  [.vscode/extensions.json](../../.vscode/extensions.json)

## Node.js

- The pinned version lives in [.nvmrc](../../.nvmrc) (mirrored by `engines` in
  [package.json.ts](../../package.json.ts)); activate it with `nvm install && nvm use`.
- The `prepare` script gates `npm install` on that version, so a wrong active Node fails the
  install (dev installs only - it never runs for consumers installing the published package).

## First run

```sh
nvm use
npm install
node --run setup    # editor soft-links + seeds .git/info/exclude
node --run test     # verify the health-check suite passes on a clean checkout
```

## Conventions enforcement

- `ESLint` lints JS/TS (config: [eslint.config.js](../../eslint.config.js)); markdown is linted via
  [eslint.markdown.config.js](../../eslint.markdown.config.js).
- `EditorConfig` keeps editor defaults consistent ([.editorconfig](../../.editorconfig)).
