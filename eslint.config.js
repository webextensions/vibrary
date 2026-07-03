import ironplateNode from 'eslint-config-ironplate/node.js';
import ironplateReactTypeScript from 'eslint-config-ironplate/react-typescript.js';
import globals from 'globals';

const backendFiles = [
    'bin/**/*.js',
    'backend/**/*.js',
    'scripts/**/*.js',
    '*.js'
];

// Each ironplate preset bundles the shared core config once. Applying two presets to the same file would run the core
// twice (silently reverting the in-between overrides), so we scope each preset to its own directory: the Node.js preset
// for the backend JavaScript and the React+TypeScript preset for the frontend TypeScript. No source file is matched by
// both, so the core never double-applies.
const scopeToFiles = function (configs, files) {
    return configs.map(function (config) {
        // Leave global `ignores`-only objects untouched (adding `files` would turn them into a normal config block)
        if (config.ignores && Object.keys(config).length === 1) {
            return config;
        }
        return { ...config, files };
    });
};

// ESLint flat config is loaded by tooling that requires a default export.
// eslint-disable-next-line import-x/no-default-export
export default [
    {
        ignores: [
            'dist/**'
        ]
    },

    ...scopeToFiles(ironplateNode, backendFiles),

    {
        files: backendFiles,
        languageOptions: {
            // Node.js ESM globals (process, console, URL, etc.); excludes CommonJS-only globals like __dirname
            globals: { ...globals.nodeBuiltin }
        },
        rules: {
            // The ironplate node preset pins these rules to Node >=20; this package requires >=22.18 (package.json
            // engines), so judge syntax and built-ins (e.g. global fetch) against the real floor.
            'n/no-unsupported-features/es-syntax': ['error', { version: '>=22.18.0' }],
            'n/no-unsupported-features/node-builtins': ['error', { version: '>=22.18.0' }]
        }
    },

    ...scopeToFiles(ironplateReactTypeScript, [
        'frontend/**/*.{js,ts,tsx}'
    ]),

    {
        // The codebase spells ref variables in full (`panelReference`, `lastYReference`), which `unicorn/name-replacements`
        // enforces as an error (it expands `ref` -> `reference`). react-x's ref-name rule wants the opposite (`...Ref`), so
        // the two conflict for every ref identifier. We defer to the error-level unicorn rule and silence this warning.
        files: [
            'frontend/**/*.{ts,tsx}'
        ],
        rules: {
            '@eslint-react/naming-convention-ref-name': 'off'
        }
    }
];
