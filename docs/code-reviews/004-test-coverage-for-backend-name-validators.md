# 004 - Security-relevant backend name validators have no tests (test glob excludes backend)

- **Area**: adding tests where fragile behavior is unexercised
- **Files**: [backend/utils/vibraryFiles.js](../../backend/utils/vibraryFiles.js),
  [package.json](../../package.json)
- **Status**: proposed (review only - not implemented)

## Finding

The project's only test file is `frontend/src/vibraryXmlCore.test.js`, and the `test` script is scoped to the
frontend:

```
"test": "node --test frontend/src/**/*.test.js"
```

Nothing under `backend/` can ever be picked up by `node --run test`. That leaves the app's path-traversal defense
unexercised: `isValidVibraryName()` and `isValidSchemasName()` in `backend/utils/vibraryFiles.js` are the first line
of validation for every file route (create, read, save, rename, duplicate, delete all call them before touching the
filesystem). They are pure string functions - ideal unit-test targets - and they encode several non-obvious edge
cases that a future "harmless" regex tweak could silently break:

- `hasSafeSegments()` must reject `..` and `.` segments explicitly because `SEGMENT_REGEX` (`[A-Za-z0-9._-]+`)
  otherwise matches them - the regex alone is NOT traversal-safe, only the extra `segment !== '..'` checks are.
- Backslash separators (`docs\..\reviews.xml`) are rejected only because the basename regex's character class
  excludes `\` - worth pinning down with a test so it stays true.
- Trailing-slash names (`docs/reviews.xml/`), empty names, and non-string inputs must all return false.
- Only the four family prefixes (`reviews|specs|tasks|ideas`) are accepted, with an optional `-suffix`.

## Suggested improvement

- Add `backend/utils/vibraryFiles.test.js` with table-driven cases for both validators: accepted names (flat,
  nested, suffixed), and rejected names (traversal via `..` segments, `.` segments, backslashes, absolute paths,
  wrong family, wrong extension, empty string, non-string).
- Widen the `test` script so backend tests run too, e.g.:
  `node --test frontend/src/**/*.test.js backend/**/*.test.js` (or simply `node --test` with a `**/*.test.js`
  default include, keeping `node_modules` excluded by Node's defaults).
- Optional follow-up targets once the glob covers backend: `slugify()` in
  [backend/utils/runClaudeTitle.js](../../backend/utils/runClaudeTitle.js) and `parseMessage()` in
  [backend/utils/runClaudeCommitMessage.js](../../backend/utils/runClaudeCommitMessage.js) are also pure and
  untested.

## Verification

- `node --run test` runs the new backend test file and passes.
- Deliberately breaking a validator (e.g. removing the `segment !== '..'` check) makes at least one new test fail,
  demonstrating the traversal cases are genuinely pinned.
- `node --run lint` and `node --run typecheck` pass.

## Risk

Low. Test-only addition plus a script-glob widening; no production code changes.
