# Codex Permission and Command Notes

Some assistant runtimes keep a narrow allow list for shell commands and deny destructive git or file operations. Codex approval is controlled by the runtime, but these are the project preferences Codex should respect.

## Preferred Allowed Commands

- File exploration: `ls`, `rg`, `rg --files`, `wc`, `git show`, `git status`, `git diff`, `git log`
- Lint scripts: `node --run eslint`, `node --run eslint:fix`, `node --run eslint:*`
- Test scripts: `node --run test`, `node --run test:*`, `node --run vitest`
- Type checks: `node --run test:types`
- Housekeeping: `node --run housekeeping:generate-package-json`

## Commands To Avoid

- `git add`, `git restore --staged`, or path-level `git reset` for staging or unstaging changes; the developer handles
  the index after manual review
- `git reset --hard`
- `git push --force`
- `rm -rf` or `rm -fr`
- `--no-verify` on git commands

## Package Management

- Do not edit `package.json` directly for dependency changes.
- Edit `package.json.ts`, then run `node --run housekeeping:generate-package-json`.
- Use `node --run housekeeping:update-and-generate-package-json` for dependency updates.
