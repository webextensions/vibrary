#!/usr/bin/env node

import { parseArgs } from 'node:util';

import { parsePort } from '../backend/cli.js';
import { startServer } from '../backend/server.js';

// The direct-start shortcut for `vibrary server`. It parses the SAME flags rather than dropping them silently: a user
// typing `vibrary-server --port 4000 --host 0.0.0.0` reasonably expects them to take effect, and an unknown flag is a
// mistake worth reporting, not ignoring. parseArgs is strict by default, so both a bad value and an unknown flag land
// in the catch as one clear line. Options the user did not pass are left off so startServer applies its own defaults.
let options;
try {
    const { values } = parseArgs({
        options: {
            'port': { type: 'string', short: 'p' },
            'host': { type: 'string' },
            'no-open': { type: 'boolean' }
        }
    });
    // Build in one literal so only the flags actually passed are present; startServer supplies the rest of the defaults.
    options = {
        ...(values.port !== undefined && { port: parsePort(values.port) }),
        ...(values.host !== undefined && { host: values.host }),
        ...(values['no-open'] === true && { open: false })
    };
} catch (error) {
    console.error(`vibrary-server: ${error.message}`);
    process.exitCode = 1;
}

if (options !== undefined) {
    try {
        await startServer(options);
    } catch (error) {
        // A startup failure (bad bind address, no listenable port) should read as one clear line, not a raw stack.
        console.error(`vibrary-server failed to start: ${error.message}`);
        process.exitCode = 1;
    }
}
