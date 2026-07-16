---
description: Alphabetical sorting convention for unordered lists in code and configuration
globs: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.cjs", "**/*.json"]
---

# Alphabetical Sorting

## Rule
When a list of items has no meaningful order, keep them **alphabetically sorted** (case-insensitive). This reduces merge conflicts and makes items easier to locate.

## Applies To
- Array literals whose element order doesn't matter (e.g., list of allowed values, feature flags, role names)
- Object keys/properties in configuration objects and JSON files
- Destructured imports and exports (named members within `{ }`)
- Import statements within each import group
- Enum members (when order is not semantically significant)
- Switch/case blocks (when order is not semantically significant)
- Package dependency lists in `package.json.ts`
- Object keys and the `permissions.allow` / `permissions.deny` lists in `.claude/settings.json` (enforced by the `claude-settings-sort` check)
- Any other unordered list of names, strings, or identifiers

## Exceptions
- Lists where order is meaningful (e.g., middleware pipeline, check launch order, priority-based arrays)
- Numeric or date-based sequences
- Items that must follow a specific logical grouping (e.g., import groups - alphabetize *within* each group, not across groups)

## Examples

```js
// Good - sorted
const ROLES = ['admin', 'editor', 'viewer'];

// Bad - unsorted
const ROLES = ['editor', 'admin', 'viewer'];
```

```js
// Good - sorted destructured import
import {
    getTrackedFiles,
    readFileAsTextOrNull
} from '../utils/repo-files.ts';
```

```js
// Good - sorted object keys
const CONFIG = {
    apiUrl: '...',
    maxRetries: 3,
    timeout: 5000
};
```
