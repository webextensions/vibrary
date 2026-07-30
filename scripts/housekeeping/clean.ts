#!/usr/bin/env node

/* eslint-disable n/no-process-exit */

// Deletes the git-ignored build/tooling artifacts listed in "patternsToDelete" below, after a 5
// second countdown. Everything git-ignored is classified first: an item must match either
// "patternsMarkedToKeep" (left alone) or "patternsToDelete" (removed) - an unrecognized git-ignored
// path exits 1 without deleting anything, so a new artifact type is a deliberate decision rather
// than a surprise deletion.
//
// The keep list is a superset across the whole branch family (it names paths that only exist on
// descendant branches), so this file stays identical down the tree and merges without conflicts.
//
// Usage (from the project's root folder):
//     $ node --run housekeeping:clean

import path from 'node:path';

import { deleteSync } from 'del';
import {
    $,
    parseCommandString
} from 'execa';
// Deep imports (not "from 'lodash-es'"): the barrel module pulls in all of lodash, which costs
// noticeably more startup time in a bundler-less Node script than the two functions actually used.
import differenceWith from 'lodash-es/differenceWith.js';
import isEqual from 'lodash-es/isEqual.js';

import { logger } from '../../utils/logger.ts';

const __dirname = import.meta.dirname;
const projectRoot = path.join(__dirname, '..', '..');

// TODO: Use globs for these patterns

const patternsMarkedToKeep = [
    '.cache/',
    '.cache/.eslintcache',
    '.claude/settings.local.json',
    '.codegraph/',
    '.env',
    '.husky/_/',
    '.vscode/soft-links/node',
    'app-data/',
    'backend/tsconfig.tsbuildinfo',
    'config/',
    'config/config.*.local.js',
    'config/config.*.local.secrets.js',
    'config/encryption/keys/*.*.runtime.private.pem',
    'config/encryption/keys/*.*.runtime.public.pem',
    'frontend/',
    'frontend/tsconfig.tsbuildinfo',
    'node_modules/',
    'temp/',
    'tsconfig.tsbuildinfo'
];

const patternsToDelete = [
    // /^public\/(.*\.bundle\..*\.css)/,
    // /^public\/(.*\.bundle\..*\.js)/,
    // /^public\/(.*\.bundle\..*\.map)/,

    // /^public-development-local\/(.*)/,
    // /^public-production-local\/(.*)/,

    '.playwright-mcp/',
    /^public-(.*)\/(.*)/
];

const doCleanup = function ({ command, flagFilterInOnlyFolders, itemTerm }, callback) {
    const { stdout } = $.sync({ cwd: projectRoot })`${parseCommandString(command)}`;

    const listOfPotentialItemsToClean = stdout
        .trim()
        .split('\n')
        .map(function (item) {
            return item.replace(/^Would remove /, '');
        })
        .filter(function filterInOnlyFoldersIfAskedSo(item) {
            if (flagFilterInOnlyFolders) {
                return item.endsWith('/');
            } else {
                return true;
            }
        })
        .filter(function filterOutPatternsMarkedForSkipping(item) {
            for (const patternMarkedToKeep of patternsMarkedToKeep) {
                if (
                    (
                        typeof patternMarkedToKeep === 'string' &&
                        item === patternMarkedToKeep
                    ) ||
                    item.match(patternMarkedToKeep)
                ) {
                    return false;
                }
            }
            return true;
        });

    const listOfItemsToClean = listOfPotentialItemsToClean
        .filter(function (item) {
            for (const patternToDelete of patternsToDelete) {
                if (
                    (
                        typeof patternToDelete === 'string' &&
                        item === patternToDelete
                    ) ||
                    item.match(patternToDelete)
                ) {
                    return true;
                }
            }
            return false;
        });

    if (listOfPotentialItemsToClean.length === 0) {
        logger.success(`The ${itemTerm}(s) are already clean. No ${itemTerm}(s) to delete.`);
        return callback();
    } else if (listOfPotentialItemsToClean.length === listOfItemsToClean.length) {
        logger.info('\nThe following ' + listOfItemsToClean.length + ` ${itemTerm}(s) are going to be deleted:`);
        for (const itemToClean of listOfItemsToClean) {
            console.log('    * ' + itemToClean);
        }
        logger.warn('\nAbout to delete the above mentioned ' + listOfItemsToClean.length + ` ${itemTerm}(s).`);
        process.stdout.write('5');
        setTimeout(function () { process.stdout.write(' 4'); }, 1000);
        setTimeout(function () { process.stdout.write(' 3'); }, 2000);
        setTimeout(function () { process.stdout.write(' 2'); }, 3000);
        setTimeout(function () { process.stdout.write(' 1'); }, 4000);
        setTimeout(function () { process.stdout.write(' Start'); }, 5000);

        setTimeout(function () {
            const countOfDeletedItems = deleteSync(listOfItemsToClean);
            logger.success('\nDeleted ' + countOfDeletedItems.length + ` ${itemTerm}(s).`);
            callback();
        }, 5000);
    } else {
        logger.error(`Error: The following ${itemTerm}(s) are not being tracked, not marked for keeping and not marked for deleting.`);
        // https://stackoverflow.com/questions/38865869/how-to-find-difference-between-two-array-using-lodash-underscore-in-nodejs/38866051#38866051
        const differentItems = differenceWith(listOfPotentialItemsToClean, listOfItemsToClean, isEqual);
        for (const differentItem of differentItems) {
            console.log('    * ' + differentItem);
        }

        process.exit(1);
    }
};

// Get list of files and directories which are ignored from Git repository
doCleanup({
    command: 'git clean -n -d -X',
    flagFilterInOnlyFolders: false,
    itemTerm: 'item'
}, function () {
    // Get list of empty irrelevant directories
    doCleanup({
        command: 'git clean -n -d -x',
        flagFilterInOnlyFolders: true,
        itemTerm: 'folder'
    }, function () {
        // done
    });
});
