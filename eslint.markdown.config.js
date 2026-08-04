// ESLint config for markdown files ONLY, used via "--config" by the "eslint:markdown" script (see
// package.json.ts) - the main eslint.config.js stays scoped to code files. Validates that relative
// links/images resolve to existing files or directories (the custom rule in
// scripts/health-checks/helpers/eslint-rules/markdown-relative-links.js). No code-block processor is enabled, so
// embedded snippets inside the docs are not linted.
// @ts-check

import markdown from '@eslint/markdown';
import {
    defineConfig,
    globalIgnores
} from 'eslint/config';

import { markdownRelativeLinks } from './scripts/health-checks/helpers/eslint-rules/markdown-relative-links.js';

// eslint-disable-next-line import-x/no-default-export
export default defineConfig([
    // NOTE: Prefer editing this ignores list in the "abstract-javascript-project" branch and letting
    // the change flow into the other branches via the usual template merges. Keeping the list
    // in sync across the "abstract-" / "template-" branches makes switching between them simpler -
    // otherwise a git-ignored artifact left behind by one branch (e.g. its build output) gets linted
    // on another.
    globalIgnores([
        '.cache/',
        'coverage/',
        'dist/', // Library build output of the npm-package template branches
        'node_modules/',
        'public-*/', // Frontend build output (config-driven publicDirectory - see config/); ESLint does not read .gitignore
        'temp/', // Scratch/temporary files (git-ignored family-wide)
        'tmp/' // Scratch/temporary files (git-ignored family-wide)
    ]),

    {
        files: ['**/*.md'],
        plugins: {
            markdown,
            local: {
                rules: {
                    'markdown-relative-links': markdownRelativeLinks
                }
            }
        },
        // GFM rather than commonmark: the docs use GitHub-flavored constructs (tables etc.).
        language: 'markdown/gfm',
        rules: {
            'local/markdown-relative-links': 'error'
        }
    }
]);
