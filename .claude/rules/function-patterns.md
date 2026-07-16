---
description: Function structure, parameter destructuring, and async conventions
globs: ["**/*.ts", "**/*.tsx", "**/*.js"]
---

# Function Patterns

## Structure
- Prefer named function expressions over declarations:
  ```js
  const doSomething = function () { ... };    // preferred
  const doSomething = () => { ... };          // also acceptable
  ```
- Keep functions small and focused
- Place helper functions before the functions that use them
- Use object destructuring for multiple parameters with defaults:
  ```js
  const fetchData = function ({ id, limit = 10, offset = 0 } = {}) { ... };
  ```

## Async Functions
- All async functions MUST have `Async` suffix
- Functions returning promises also use `Async` suffix (add ESLint disable comment if needed)
- Always `await` or `return` calls to Async functions

## Error Handling
- Async operations follow the `[error, result]` tuple convention - the canonical shape and rules
  live in [error-handling.md](./error-handling.md).

## Organization
- Group related functions in the same file
- For class methods: follow logical order (create, read, update, delete)
- Name functions as `actionEntityAsync` style verbs-first (`createUserAsync`, `listUsersAsync`) so
  call sites read naturally
