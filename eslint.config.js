// https://eslint.org/docs/latest/use/configure/configuration-files
// @ts-check

import {
    defineConfig,
    globalIgnores
} from 'eslint/config';
import eslintConfigIronplateNodeTypeScript from 'eslint-config-ironplate/node-typescript.js';
import importNewlines from 'eslint-plugin-import-newlines';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';

// eslint-disable-next-line import-x/no-default-export
export default defineConfig([
    // NOTE: Prefer editing this ignores list in the "abstract-javascript-project" branch and letting
    // the change flow into the other branches via the usual template merges. Keeping the list
    // identical across the "abstract-" / "template-" branches makes switching between them simpler -
    // otherwise a git-ignored artifact left behind by one branch (e.g. its build output) gets linted
    // on another.
    globalIgnores([
        'node_modules/',
        'coverage/',
        '.cache/',
        'public-*/', // Frontend build output (config-driven publicDirectory - see config/); ESLint does not read .gitignore
        'config/*.local.js' // Local configuration files (git-ignored, machine-specific)
    ]),

    // Shared base config (core + Node.js + TypeScript rules; the TypeScript parser comes bundled,
    // via the "typescript-eslint" package, so no "languageOptions.parser" wiring is needed here).
    ...eslintConfigIronplateNodeTypeScript,

    // eslint-config-ironplate intentionally declares no language globals (the right set depends on
    // the runtime); declare them here. Default: the ESM-safe Node.js subset (excludes the
    // CommonJS-only globals like __dirname, require, module - those are added for CJS files below).
    {
        languageOptions: {
            globals: {
                ...globals.nodeBuiltin
            }
        }
    },

    // CommonJS files: full Node.js globals (incl. __dirname, __filename, require, module, exports)
    {
        files: [
            '**/*.cjs',
            '**/*.cts'
        ],
        languageOptions: {
            globals: {
                ...globals.node
            }
        }
    },

    // ES modules: __dirname does not exist (use import.meta.dirname)
    {
        files: [
            '**/*.js',
            '**/*.mjs',
            '**/*.mts',
            '**/*.ts'
        ],
        rules: {
            'no-restricted-globals': ['error', { name: '__dirname' }]
        }
    },

    // Test files (Vitest). Tests in this repo import describe/it/expect from 'vitest' explicitly
    // (see .claude/rules/testing.md); declaring the globals keeps configs/tests portable anyway.
    {
        files: [
            'test/**/*.{js,ts}',
            '**/*.test.{js,ts}',
            '**/*.spec.{js,ts}'
        ],
        languageOptions: {
            globals: {
                ...globals.vitest
            }
        }
    },

    // Project-specific plugins and rules on top of eslint-config-ironplate. If they are stable and
    // useful, move those as a pull request to https://github.com/webextensions/eslint-config-ironplate/
    //
    // TODO: Add eslint-plugin-async-protect (async-suffix + async-await rules, backing the
    //       documented Async-suffix convention in .claude/rules/function-patterns.md) once it
    //       supports ESLint 10 (it currently declares peer "eslint": "5 - 8").
    {
        plugins: {
            'import-newlines': /** @type {import('eslint').ESLint.Plugin} */ (importNewlines),
            'simple-import-sort': /** @type {import('eslint').ESLint.Plugin} */ (simpleImportSort)
        },
        rules: {
            'id-denylist': [
                'error',
                'e', // To avoid it being used as short for error/event
                'event', // To avoid conflicts with window.event
                'raw', // eg: One may use it as sql.raw() via drizzle-orm (in most cases, sql.identifier() can be used instead)
                'location' // To avoid conflicts with window.location
            ],
            'object-shorthand': ['error', 'properties'],

            '@stylistic/no-multi-spaces': [
                'error',
                {
                    ignoreEOLComments: true,
                    exceptions: {
                        ImportAttribute: false,
                        ObjectPattern: true,
                        Property: false
                    }
                }
            ],

            '@stylistic/quote-props': [
                'error',
                'as-needed',
                {
                    numbers: true
                }
            ],

            // Caught errors are often intentionally unused (the catch block logs / falls back);
            // match the web-app template's leniency. For TypeScript files, the equivalent
            // "@typescript-eslint/no-unused-vars" override lives in the block below.
            'no-unused-vars': ['error', { caughtErrors: 'none' }],

            'import-newlines/enforce': ['error', { items: 1 }], // `items: 1` effectively means each on its own line

            // eslint-config-ironplate assumes Node.js >= 20; this repo's floor is higher (see
            // "engines" in package.json), and some code relies on newer built-ins listed in
            // "ignores" because the rule flags them as experimental on the configured floor:
            // module.stripTypeScriptTypes (scripts/health-checks/checks/check-syntax.ts) and
            // path.matchesGlob (scripts/health-checks/checks/block-non-keyboard-characters/exempted-files.ts).
            'n/no-unsupported-features/es-syntax': ['error', { version: '>=24.2.0' }],
            'n/no-unsupported-features/node-builtins': ['error', { version: '>=24.2.0', ignores: ['module.stripTypeScriptTypes', 'path.matchesGlob'] }],

            'simple-import-sort/exports': 'error',
            'simple-import-sort/imports': 'error',

            'unicorn/consistent-boolean-name': 'off',
            'unicorn/name-replacements': 'off',
            'unicorn/no-break-in-nested-loop': 'off',
            'unicorn/no-top-level-assignment-in-function': 'off',
            'unicorn/no-useless-else': 'off',
            'unicorn/require-array-sort-compare': 'off'
        }
    },

    // TypeScript files: ironplate's typeScriptDelta hands "no-unused-vars" over to
    // "@typescript-eslint/no-unused-vars" with default options; apply the same caught-error
    // leniency as the base rule above. Re-assert "no-unused-vars": "off" because the project-wide
    // override above would otherwise re-enable the base rule for TypeScript files too (where it
    // false-positives on type-only constructs such as function-type parameter names).
    {
        files: [
            '**/*.cts',
            '**/*.mts',
            '**/*.ts'
        ],
        rules: {
            'no-unused-vars': 'off',
            '@typescript-eslint/no-unused-vars': ['error', { caughtErrors: 'none' }]
        }
    }
]);
