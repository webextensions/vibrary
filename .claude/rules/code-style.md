# Code Style - Baseline

The repo-wide style baseline. ESLint ([eslint.config.js](../../eslint.config.js)), EditorConfig
([.editorconfig](../../.editorconfig)), and [.gitattributes](../../.gitattributes) enforce it -
still write conforming code in the first place.

- ESM (`"type": "module"`), 4-space indentation, semicolons, unix line endings.
- Shell scripts use the `#!/usr/bin/env bash` shebang (resolves bash via `PATH` instead of
  hard-coding `/bin/bash`).

## See Also

- [alphabetical-sorting.md](./alphabetical-sorting.md) - keep unordered lists sorted
- [function-patterns.md](./function-patterns.md) - naming and function-shape patterns
- [non-keyboard-characters.md](./non-keyboard-characters.md) - ASCII punctuation only
- [testing.md](./testing.md) - test framework, placement, and style
