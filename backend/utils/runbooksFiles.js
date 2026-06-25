import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { glob } from 'glob';
import ignore from 'ignore';

const RUNBOOKS_IGNORE_FILE = '.runbooksignore';

// Matches a runbooks file basename: "<family>.xml" or "<family>-<something>.xml", where family is one of the four kinds
// the app understands. A name may be a nested path (e.g. "docs/reviews.xml"): each leading segment must match
// SEGMENT_REGEX, which excludes path separators and rejects ".."/"." segments, so a valid name can never traverse out of
// the working directory.
const RUNBOOKS_NAME_REGEX = /^(truths|reviews|specs|tasks|ideas)(-[A-Za-z0-9._-]+)?\.xml$/;
const SEGMENT_REGEX = /^[A-Za-z0-9._-]+$/;

const isValidRunbooksName = function (name) {
    if (typeof name !== 'string' || name === '') {
        return false;
    }
    const segments = name.split('/');
    const base = segments.at(-1);
    return segments.slice(0, -1).every(function (segment) {
        return SEGMENT_REGEX.test(segment) && segment !== '..' && segment !== '.';
    }) && RUNBOOKS_NAME_REGEX.test(base);
};

// Load the ".runbooksignore" file from the cwd root and return an "ignore" matcher (gitignore semantics: comments,
// negation, directory rules). Read fresh per call so edits take effect without a server restart, mirroring how git
// re-reads ".gitignore". A missing file yields an empty matcher (nothing ignored); other read errors propagate.
const loadRunbooksIgnore = async function (cwd) {
    const ig = ignore();
    try {
        const content = await readFile(path.join(cwd, RUNBOOKS_IGNORE_FILE), 'utf8');
        ig.add(content);
    } catch (error) {
        if (error.code !== 'ENOENT') {
            throw error;
        }
    }
    return ig;
};

const isRunbooksNameIgnored = async function (cwd, name) {
    const ig = await loadRunbooksIgnore(cwd);
    return ig.ignores(name);
};

const listRunbooksFiles = async function (cwd) {
    const ig = await loadRunbooksIgnore(cwd);
    const matches = await glob('**/{truths,reviews,specs,tasks,ideas}*.xml', { cwd, nodir: true, ignore: ['**/node_modules/**', '**/.git/**'] });
    return ig
        .filter(matches.filter(function (name) {
            return isValidRunbooksName(name);
        }))
        .toSorted(function (a, b) {
            return a.localeCompare(b);
        });
};

export { isRunbooksNameIgnored, isValidRunbooksName, listRunbooksFiles };
