---
description: Non-autofixable ESLint rules that commonly trip up first-pass code generation
globs: ["**/*.cjs", "**/*.cts", "**/*.js", "**/*.mjs", "**/*.mts", "**/*.ts"]
---

# ESLint Gotchas - Get These Right on First Pass

These rules are **not autofixable**, so violations survive `node --run eslint:fix` and require
manual correction. Internalize them when writing new code.

## Banned Identifiers

- `id-denylist` bans `e`, `event`, `raw`, `location` (each entry in
  [eslint.config.js](../../eslint.config.js) documents its reason). Use `err`, `evt`, the fully
  named field, and a non-conflicting name respectively.

## String Methods

- Use `String#slice()`, never `String#substring()`. Rule: `unicorn/prefer-string-slice`.

## Multi-line Operator Placement

- Place binary operators at the **end** of the previous line, not the start of the next. Rules:
  `@stylistic/operator-linebreak`, `@stylistic/indent-binary-ops`.

  ```js
  // Good
  const total = subtotal +
      tax +
      shipping;

  // Bad - operator at start of line
  const total = subtotal
      + tax
      + shipping;
  ```

## `__dirname` in ES Modules

- `no-restricted-globals` bans bare `__dirname` in ES module files (`.js`, `.mjs`, `.mts`, `.ts`);
  CommonJS files (`.cjs`, `.cts`) are unaffected. In ES modules, use `import.meta.dirname`.

## Imports and References

- Do not import symbols speculatively - `no-unused-vars` / `@typescript-eslint/no-unused-vars` are
  not autofixable. Import only what the code references right now.
- `no-undef` fires for symbols referenced but never imported or declared - add the import when
  introducing a new identifier; do not assume it is globally available.
- Never use namespace imports (`import * as ns`) - destructure the named members instead. Rule:
  `import-x/no-namespace` (its auto-fix covers only trivial cases).

## Callback Returns

- Calls to `callback`, `done`, `exitWithError`, `reject`, `resolve` must be `return`ed. Rule:
  `n/callback-return`.

## Async / Await Discipline

The Async-suffix convention ([function-patterns.md](./function-patterns.md)) will be lint-enforced
by `eslint-plugin-async-protect` once it supports ESLint 10 (tracked in
[docs/specs/todo/TODO-for-abstract-javascript-project.md](../../docs/specs/todo/TODO-for-abstract-javascript-project.md)).
Write conforming code now - the paired rules (`async-protect/async-suffix`,
`async-protect/async-await`) are errors and not autofixable when they arrive:

- Every `async` function name ends with `Async`; non-async functions must not use the suffix (the
  plugin enforces both directions).
- Every call to an `Async`-suffixed function is `await`ed (or `return`ed); conversely, `await` on a
  non-`Async` (sync) function is an error.
- Never fire-and-forget an `Async` function without an explicit comment justifying it.

  ```js
  // Good - name carries the Async suffix; sync call has no await
  const fetchUserAsync = async function (id) { ... };
  const port = getPort();

  // Bad - async function missing the suffix
  const fetchUser = async function (id) { ... };
  // Bad - awaiting a sync function
  const port = await getPort();
  ```

## Workflow

- Before reporting a task done, run `node --run eslint:fix` (or the scoped
  `node --run eslint:changed-files:fix`), then confirm no surviving errors.
- Do not paper over a real failure with `// eslint-disable-next-line` - fix the underlying issue,
  or surface the blocker.
