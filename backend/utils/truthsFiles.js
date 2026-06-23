import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { glob } from 'glob';
import ignore from 'ignore';

const TRUTHS_IGNORE_FILE = '.truthsignore';

// Matches the basename "truths.xml" or "truths-<something>.xml". A name may be a nested path (e.g. "docs/truths.xml"):
// each leading segment must match SEGMENT_REGEX, which excludes path separators and rejects ".."/"." segments, so a
// valid name can never traverse out of the working directory.
const TRUTHS_NAME_REGEX = /^truths(-[A-Za-z0-9._-]+)?\.xml$/;
const SEGMENT_REGEX = /^[A-Za-z0-9._-]+$/;

const isValidTruthsName = function (name) {
    if (typeof name !== 'string' || name === '') {
        return false;
    }
    const segments = name.split('/');
    const base = segments.at(-1);
    return segments.slice(0, -1).every(function (segment) {
        return SEGMENT_REGEX.test(segment) && segment !== '..' && segment !== '.';
    }) && TRUTHS_NAME_REGEX.test(base);
};

// Load the ".truthsignore" file from the cwd root and return an "ignore" matcher (gitignore semantics: comments,
// negation, directory rules). Read fresh per call so edits take effect without a server restart, mirroring how git
// re-reads ".gitignore". A missing file yields an empty matcher (nothing ignored); other read errors propagate.
const loadTruthsIgnore = async function (cwd) {
    const ig = ignore();
    try {
        const content = await readFile(path.join(cwd, TRUTHS_IGNORE_FILE), 'utf8');
        ig.add(content);
    } catch (error) {
        if (error.code !== 'ENOENT') {
            throw error;
        }
    }
    return ig;
};

const isTruthsNameIgnored = async function (cwd, name) {
    const ig = await loadTruthsIgnore(cwd);
    return ig.ignores(name);
};

const listTruthsFiles = async function (cwd) {
    const ig = await loadTruthsIgnore(cwd);
    const matches = await glob('**/truths*.xml', { cwd, nodir: true, ignore: ['**/node_modules/**', '**/.git/**'] });
    return ig
        .filter(matches.filter(function (name) {
            return isValidTruthsName(name);
        }))
        .toSorted(function (a, b) {
            return a.localeCompare(b);
        });
};

export { isTruthsNameIgnored, isValidTruthsName, listTruthsFiles };
