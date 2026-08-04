---
name: reviewing-conventions
description: Review code files for adherence to this project's conventions and coding standards
argument-hint: [file-or-directory-path]
disable-model-invocation: true
---

# Review Code for Project Conventions

Review `$ARGUMENTS` (file or directory) for adherence to this project's conventions. Use the
checklist below; deep-dive details live in [`.claude/rules/`](../../rules/).

## Checklist

### Naming

- [ ] camelCase for variables, functions, utility files/dirs
- [ ] PascalCase for classes and enums
- [ ] UPPER_CASE for constants
- [ ] `Async` suffix on every async function and every promise-returning function (and **only** on
      those - non-async functions must not use it)
- [ ] Boolean prefixes: `flag` (preferred), `is`, `has`
- [ ] Event handlers: `handle` prefix; state setters: `set` prefix
- [ ] `err` not `e` for errors, `evt` not `e`/`event` for events
- [ ] Banned identifiers (ESLint `id-denylist`): `e`, `event`, `raw`, `location`

### Exports and Imports

- [ ] Named exports only (no default exports)
- [ ] File extensions in all relative import paths (`.js`, `.ts`, `.json`)
- [ ] Destructured imports for named exports (no namespace `* as` imports)
- [ ] Node.js builtins imported with the `node:` prefix
- [ ] Import groups ordered by `simple-import-sort`; alphabetized within each group (see
      [import-organization.md](../../rules/import-organization.md))
- [ ] No unused imports left from a refactor

### Code Style

- [ ] 4 spaces indentation, LF line endings, semicolons at end of statements
- [ ] Single quotes for strings
- [ ] No trailing commas
- [ ] Spaces inside curly braces: `{ key: value }`
- [ ] Parentheses around all arrow function params: `(x) => x`
- [ ] Curly braces for all conditional blocks
- [ ] ES Modules (`.js`/`.ts`); `.cjs`/`.cts` only when necessary
- [ ] Alphabetical sorting in unordered lists (arrays, object keys, enum members, destructured
      imports/exports - see [alphabetical-sorting.md](../../rules/alphabetical-sorting.md))
- [ ] `String#slice()` not `String#substring()`
- [ ] Multi-line binary operators at the **end** of the previous line, not the start of the next
- [ ] ES modules use `import.meta.dirname`, not `__dirname`

### Functions

- [ ] Named function expressions preferred over declarations
- [ ] Object destructuring for multiple parameters
- [ ] Helper functions placed before their callers
- [ ] `[error, result]` tuple pattern for async - never `throw` (see
      [error-handling.md](../../rules/error-handling.md), including its scope notes for one-shot
      tooling scripts)
- [ ] Outermost `try/catch` wrapping for unexpected errors
- [ ] Errors logged with `console.error(msgErr, err)` before returning
- [ ] Error construction: `new Error(msgErr, { cause: { originalError, code, ...context } })`
- [ ] Error codes: `UPPER_CASE` with descriptive prefix (`ERROR_FILE_NOT_FOUND`, `ERROR_UNEXPECTED`)
- [ ] Every `Async` call is `await`ed or `return`ed (never fire-and-forget without a comment
      justifying it)

### Tests (if applicable - see [testing.md](../../rules/testing.md))

- [ ] Vitest with `describe`, `it`, `expect` imported from `'vitest'`
- [ ] Named `function` expressions for `describe`/`it` callbacks (not arrow functions)
- [ ] Test file naming: `{subject}.test.js` (`.test.ts` only when the test itself needs
      TypeScript), colocated next to the source or grouped under `test/`
- [ ] `[error, result]` tuple asserted for async operations

### Documentation (if applicable)

- [ ] Bullet lists and unnumbered headings preferred (numbered only for truly sequenced content)
- [ ] ASCII punctuation only (see
      [non-keyboard-characters.md](../../rules/non-keyboard-characters.md))

### Workflow Checks

- [ ] `node --run eslint:fix` (or the scoped `node --run eslint:changed-files:fix`) produces no
      surviving errors
- [ ] `node --run test:types` passes
- [ ] No `// eslint-disable-*`, `// @ts-expect-error`, `// @ts-ignore`, or `as any` papering over
      real issues
- [ ] Hacks/workarounds (if any) documented in [docs/because/](../../../docs/because/README.md)

## Output

Report findings as a list grouped by file:

- **Pass**: conventions followed correctly (summarize, don't enumerate every passing item)
- **Issue**: convention violation with file, line, and suggested fix
- **Suggestion**: optional improvements (not violations)

Cite the specific rule file in [`.claude/rules/`](../../rules/) when flagging non-obvious
violations so the author can read the deeper guidance.
