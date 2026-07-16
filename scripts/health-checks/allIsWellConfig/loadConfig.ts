// Loads the layered all-is-well config: all-is-well.config.local.ts (git-ignored, machine-local) if
// it exists, else all-is-well.config.ts (committed base) if it exists, else no configuration ({}).
// Only ONE file is ever imported here - the deep merge deliberately lives INSIDE the local config
// file itself (it imports the base config and `extend`s its overrides over it; see
// all-is-well.config.local.example.ts), web-app-template style.
//
// A config file that exists but is broken (syntax error, wrong export) is allowed to throw: this is
// one-shot tooling, and a top-level rejection fails the suite loudly instead of silently running
// with the wrong configuration.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { AllIsWellConfig } from './types.ts';

const healthChecksDir = path.resolve(import.meta.dirname, '..');

// Highest priority first; the first existing file wins.
const CONFIG_FILE_NAMES = [
    'all-is-well.config.local.ts',
    'all-is-well.config.ts'
];

const loadConfigAsync = async function (): Promise<AllIsWellConfig> {
    for (const fileName of CONFIG_FILE_NAMES) {
        const filePath = path.join(healthChecksDir, fileName);
        if (!fs.existsSync(filePath)) {
            continue;
        }
        // Import via a computed file URL, never a string-literal specifier: the local file is
        // git-ignored and usually absent, so a literal import would fail the tsc type check
        // (TS2307: cannot find module) whenever the file does not exist.
        const configModule = await import(pathToFileURL(filePath).href) as { allIsWellConfig?: AllIsWellConfig };
        if (!configModule.allIsWellConfig) {
            throw new Error(`Error: ${fileName} must provide a named export "allIsWellConfig"`);
        }
        return configModule.allIsWellConfig;
    }
    return {};
};

export { loadConfigAsync };
