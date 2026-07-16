---
description: Error handling patterns using the [error, result] tuple convention
globs: ["**/*.ts", "**/*.tsx", "**/*.js"]
---

# Error Handling - `[error, result]` Tuple Pattern

## Core Pattern
All async operations return a two-element array: `[error, result]`.

```js
const [err, result] = await someOperationAsync(id);
if (err) {
    const msgErr = `Error: Failed to do X for "${id}"`;
    console.error(msgErr, err);
    return [new Error(msgErr, { cause: { originalError: err, code: 'ERROR_CODE', id } })];
}
return [null, result];
```

## Rules
- **Always** return `[error]` or `[null, result]` - never throw from async functions
- **Error-first**: error is index 0, result is index 1
- **Variable naming**: use `err` (never `e`), `msgErr` for error message strings
- **Always log** with `console.error(msgErr, err)` before returning the error tuple
- **Error construction**: use `new Error(message, { cause: { originalError, code, ...context } })`
- **Error codes**: `UPPER_CASE` with descriptive prefix (`ERROR_FILE_NOT_FOUND`, `ERROR_UNEXPECTED`)
- **Wrap in try/catch** at the outermost level of async functions for unexpected errors

## Scope Notes
- This convention applies to application-style async code. Small one-shot tooling scripts (health
  checks, hooks) may instead exit non-zero on failure - match the style of the surrounding code.
- Synchronous helpers may throw or return `null` for the "nothing" case when the surrounding code
  already does so (e.g. `readFileAsTextOrNull` in [scripts/utils/repo-files.ts](../../scripts/utils/repo-files.ts)).
