import { createRequire } from 'node:module';

import { Command } from 'commander';

import { startServer } from './server.js';

const require = createRequire(import.meta.url);
const package_ = require('../package.json');

const buildProgram = function () {
    const program = new Command();

    program
        .name('runbooks')
        .description(package_.description)
        .version(package_.version);

    program
        .command('server')
        .description('Start the runbooks web server for the current folder')
        .option('-p, --port <number>', 'preferred port (advances to the next free one if busy)', '3000')
        .option('--no-open', 'do not open the browser automatically')
        .action(async function (options) {
            await startServer({
                port: Number(options.port),
                open: options.open
            });
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
