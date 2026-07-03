import { createRequire } from 'node:module';

import { Command, InvalidArgumentError } from 'commander';

import { startServer } from './server.js';

// Reject bad --port values up front: `Number()` alone would turn them into NaN, which get-port treats as "no
// preference" and answers with a random free port instead of an error.
const parsePort = function (value) {
    const port = Number(value);
    if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
        throw new InvalidArgumentError('Port must be an integer between 1 and 65535.');
    }
    return port;
};

const require = createRequire(import.meta.url);
const package_ = require('../package.json');

const buildProgram = function () {
    const program = new Command();

    program
        .name('vibrary')
        .description(package_.description)
        .version(package_.version);

    program
        .command('server')
        .description('Start the vibrary web server for the current folder')
        .option('-p, --port <number>', 'preferred port (advances to the next free one if busy)', parsePort, 3000)
        .option('--host <address>', 'address to bind; 0.0.0.0 exposes the server (and its agent runs) to the network', '127.0.0.1')
        .option('--no-open', 'do not open the browser automatically')
        .action(async function (options) {
            try {
                await startServer({
                    port: options.port,
                    host: options.host,
                    open: options.open
                });
            } catch (error) {
                // A startup failure (bad bind address, no listenable port) should read as one clear line, not a raw
                // stack from an unhandled rejection.
                console.error(`vibrary-server failed to start: ${error.message}`);
                process.exitCode = 1;
            }
        });

    return program;
};

const run = function (argv = process.argv) {
    const program = buildProgram();

    // With no subcommand, show help instead of doing nothing
    if (argv.length <= 2) {
        program.help();
    }

    program.parse(argv);
};

export { buildProgram, run };
