import { createRequire } from 'node:module';

import { Command, InvalidArgumentError } from 'commander';

import { checkVibraryAsync } from './files/checkVibrary.js';
import { initVibraryAsync } from './files/initVibrary.js';
import { searchVibrary } from './search/searchVibrary.js';
import { vibraryIncludeExistsAsync } from './files/vibraryFiles.js';
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

// One human line per problem, grouped under its kind's phrasing; the shapes come from checkVibrary.js.
const describeProblem = function (problem) {
    if (problem.kind === 'unparseable') {
        return `${problem.file}: cannot be parsed (${problem.detail})`;
    }
    if (problem.kind === 'duplicate-title') {
        return `${problem.file}: duplicate title "${problem.title}" (first used in ${problem.alsoIn})`;
    }
    if (problem.kind === 'broken-reference') {
        return `${problem.file}: "${problem.title}" references "${problem.reference}", which no entry has`;
    }
    return `${problem.file}: "${problem.title}" is ${problem.state === 'stale' ? 'stale (content changed after approval)' : 'unapproved'}`;
};

// Shared by check/list/search: report the unconfigured folder distinctly (exit 2) - a folder with no .vibraryinclude
// matches nothing, and an empty scan there must never read as "clean".
const reportUnconfigured = function () {
    console.error('No .vibraryinclude found: nothing is included, so nothing was checked. Create a .vibraryinclude to configure this folder.');
    process.exitCode = 2;
};

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

    program
        .command('init')
        .description('Scaffold this folder: a starter .vibraryinclude and a specs.xml demonstrating approvals, relations, and labels')
        .option('--minimal', 'write only the .vibraryinclude', false)
        .action(async function (options) {
            const { written, skipped } = await initVibraryAsync(process.cwd(), { minimal: options.minimal });
            for (const name of written) {
                console.log(`created ${name}`);
            }
            for (const name of skipped) {
                console.log(`kept existing ${name} (not overwritten)`);
            }
            if (written.length === 0) {
                console.log('Nothing to do - everything already exists.');
            }
        });

    // The headless commands run the same workers the routes use (the { cwd }-factory split keeps them
    // Express-free) and never shell out to claude - so they work in a CI container with no agent CLI and no key.
    program
        .command('check')
        .description('Validate the folder\'s vibrary files; exits 1 on any problem, 2 when no .vibraryinclude exists')
        .option('--require-approved', 'also fail when an entry is unapproved or its approval is stale', false)
        .option('--json', 'emit the report as JSON', false)
        .action(async function (options) {
            const report = await checkVibraryAsync(process.cwd(), { requireApproved: options.requireApproved });
            if (options.json) {
                console.log(JSON.stringify(report, null, 4));
            } else if (!report.configured) {
                reportUnconfigured();
                return;
            } else if (report.problems.length === 0) {
                console.log(`OK: ${report.files.length} file${report.files.length === 1 ? '' : 's'} checked, no problems found.`);
            } else {
                for (const problem of report.problems) {
                    console.error(describeProblem(problem));
                }
                console.error(`${report.problems.length} problem${report.problems.length === 1 ? '' : 's'} found.`);
            }
            // The exit code IS the feature: it makes a CI step a one-liner. --json keeps the same contract.
            process.exitCode = !report.configured ? 2 : (report.problems.length > 0 ? 1 : 0);
        });

    program
        .command('list')
        .description('List every included file with its approved/total and broken-reference counts')
        .action(async function () {
            const report = await checkVibraryAsync(process.cwd());
            if (!report.configured) {
                reportUnconfigured();
                return;
            }
            for (const file of report.files) {
                const tallies = file.total === null ?
                    'cannot be parsed' :
                    `${file.approved}/${file.total} approved${file.brokenReferences > 0 ? `, ${file.brokenReferences} broken reference${file.brokenReferences === 1 ? '' : 's'}` : ''}`;
                console.log(`${file.name}  ${tallies}`);
            }
        });

    program
        .command('search <query>')
        .description('Search every included file\'s entries (title, content, notes, labels)')
        .option('--match-case', 'match case exactly instead of the default case-insensitive scan', false)
        .option('--whole-word', 'match whole words only', false)
        .action(async function (query, options) {
            if (!(await vibraryIncludeExistsAsync(process.cwd()))) {
                reportUnconfigured();
                return;
            }
            const { results } = await searchVibrary(process.cwd(), query, { matchCase: options.matchCase, wholeWord: options.wholeWord });
            if (results.length === 0) {
                console.log('No matches.');
                return;
            }
            for (const file of results) {
                console.log(file.path);
                for (const match of file.matches) {
                    console.log(`  ${match.title || '(untitled)'} [${match.type}, ${match.field}]  ${match.snippet}`);
                }
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

export { buildProgram, parsePort, run };
