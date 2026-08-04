#!/usr/bin/env node

// CLI wrapper. Keep this thin: parse arguments here and delegate the actual work to the library
// functions exported from index.js. (The core logic lives in lib/, re-exported by index.js - not here.)

import { program } from 'commander';

import { vibrary } from './index.js';
import packageJson from './package.json' with { type: 'json' };

const packageName = packageJson.name;
const packageDescription = packageJson.description;
const packageVersion = packageJson.version;

// Drop the npm scope (e.g. "@scope/foo" -> "foo"). pop() is typed string | undefined, so fall back to
// the full name (split() on a non-empty string always returns at least one element).
const commandName = packageName.split('/').pop() ?? packageName;

program
    .name(commandName)
    .description(packageDescription)
    .version(packageVersion);

program
    .argument('[name]', 'name to greet', 'world')
    .option('-u, --uppercase', 'print the greeting in uppercase')
    .action((name, options) => {
        let message = vibrary(name);

        if (options.uppercase) {
            message = message.toUpperCase();
        }

        console.log(message);
    });

program.parse();
