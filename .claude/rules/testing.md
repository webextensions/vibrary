---
description: Vitest testing conventions and patterns
globs: ["test/**/*.js", "test/**/*.ts", "**/*.test.js", "**/*.test.ts"]
---

# Testing Conventions

## Framework
- **Vitest** is the test framework
- Import `describe`, `it`, `expect` from `'vitest'`
- Run tests with `node --run vitest`

## File Placement
- Two homes; vitest discovers both via the `**/*.test.{js,ts}` include in `vitest.config.js`:
    - **Colocated** (preferred for simple, self-contained units): `{subject}.test.js` right next to
      the source file it tests (e.g. `scripts/health-checks/helpers/eslint-rules/markdown-relative-links.js`
      and its sibling `markdown-relative-links.test.js`) - keeps the code and its test together,
      simpler and more maintainable.
    - **`test/` at the project root** - for tests that benefit from grouping: integration/sanity
      suites and tests spanning multiple modules (e.g. `test/sanity.test.js`).
- Test file naming: `{subject}.test.js` (or `.test.ts` when the test itself needs TypeScript)
- When colocating a test in a directory not yet listed in the vitest check's `changeDependencies`
  (`scripts/health-checks/all-is-well.ts`), add that directory - otherwise `--optimize-for-change`
  skips vitest for changes there.

## Structure
```js
// Import the test subject first
import '../path/to/module.js';

import {
    describe,
    expect,
    it
} from 'vitest';

describe('moduleName', function () {
    it('should do something specific', function () {
        expect(result).toBe(expected);
    });
});
```

## Rules
- Use named `function` expressions for `describe` and `it` callbacks (not arrow functions)
- Follow the same code style as production code: 4 spaces, single quotes, semicolons, no trailing commas
- Named exports only - no default exports
- Include file extensions in all imports
- For async operations, assert the `[error, result]` tuple pattern (see
  [error-handling.md](./error-handling.md)):
  ```js
  const [err, result] = await someOperationAsync();
  expect(err).toBeNull();
  expect(result).toBeDefined();
  ```
