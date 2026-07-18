import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

import { glob } from 'glob';
import ignore from 'ignore';

const VIBRARY_INCLUDE_FILE = '.vibraryinclude';

// Matches a vibrary file basename: "<family>.xml" or "<family>-<something>.xml", where family is one of the four kinds
// the app understands. A name may be a nested path (e.g. "docs/reviews.xml"): each leading segment must match
// SEGMENT_REGEX, which excludes path separators and rejects ".."/"." segments, so a valid name can never traverse out of
// the working directory.
const VIBRARY_NAME_REGEX = /^(reviews|specs|tasks|ideas)(-[A-Za-z0-9._-]+)?\.xml$/;
// Matches the sidecar that holds a vibrary file's form schemas: "<vibrary-basename>.schemas.json" (e.g.
// "tasks.xml.schemas.json"). Read on demand to resolve an entry's <formSchemaRef>; never listed or edited via the app.
const VIBRARY_SCHEMAS_NAME_REGEX = /^(reviews|specs|tasks|ideas)(-[A-Za-z0-9._-]+)?\.xml\.schemas\.json$/;
const SEGMENT_REGEX = /^[A-Za-z0-9._-]+$/;

const hasSafeSegments = function (name) {
    return name.split('/').slice(0, -1).every(function (segment) {
        return SEGMENT_REGEX.test(segment) && segment !== '..' && segment !== '.';
    });
};

const isValidVibraryName = function (name) {
    if (typeof name !== 'string' || name === '') {
        return false;
    }
    return hasSafeSegments(name) && VIBRARY_NAME_REGEX.test(name.split('/').at(-1));
};

const isValidSchemasName = function (name) {
    if (typeof name !== 'string' || name === '') {
        return false;
    }
    return hasSafeSegments(name) && VIBRARY_SCHEMAS_NAME_REGEX.test(name.split('/').at(-1));
};

// Load the ".vibraryinclude" file from the cwd root and return an "ignore" matcher whose patterns name the files shown
// in the listing (gitignore-style globs, with "!" excluding a match). Read fresh per call so edits take effect without a
// server restart, mirroring how git re-reads ".gitignore". A missing file yields an empty matcher (nothing matches, so
// nothing is shown); other read errors propagate. The "ignore" library's match result maps directly onto inclusion:
// ig.ignores(name) is true for a name matched by a plain pattern and false for one re-negated by "!".
const loadVibraryInclude = async function (cwd) {
    const ig = ignore();
    try {
        const content = await readFile(path.join(cwd, VIBRARY_INCLUDE_FILE), 'utf8');
        ig.add(content);
    } catch (error) {
        if (error.code !== 'ENOENT') {
            throw error;
        }
    }
    return ig;
};

const isVibraryNameIncluded = async function (cwd, name) {
    const ig = await loadVibraryInclude(cwd);
    return ig.ignores(name);
};

// Whether a ".vibraryinclude" file exists at the cwd root, so the listing endpoint (and the explorer's empty state) can
// tell "nothing is included yet because no .vibraryinclude exists" apart from "a .vibraryinclude exists but its
// patterns match nothing".
const vibraryIncludeExistsAsync = async function (cwd) {
    try {
        await access(path.join(cwd, VIBRARY_INCLUDE_FILE));
        return true;
    } catch {
        return false;
    }
};

// Directories the walk never descends into. Beyond the obvious two, the common build-output/vendor directories are
// skipped because that is where a big tree's file count usually lives and vibrary files plausibly never do (a user
// keeping specs.xml in dist/ is fighting their own build tool). This matters because the walk is linear in TREE size
// regardless of how few vibrary files exist - measured ~12 ms per call at 5,000 files and ~107 ms at 50,000 (warm
// cache) - and every listing/summary/search request pays it. The re-walk-per-request design itself is deliberate for
// freshness (a created file must appear on the very next listing call), which is why the result is not TTL-cached.
const LISTING_IGNORE = ['node_modules', '.git', 'dist', 'build', 'out', 'coverage', '.next', '.venv', 'vendor', 'target']
    .map(function (directory) { return `**/${directory}/**`; });

const listVibraryFiles = async function (cwd) {
    const ig = await loadVibraryInclude(cwd);
    const matches = await glob('**/{reviews,specs,tasks,ideas}*.xml', { cwd, nodir: true, ignore: LISTING_IGNORE });
    return matches
        .filter(function (name) {
            return isValidVibraryName(name) && ig.ignores(name);
        })
        .toSorted(function (a, b) {
            return a.localeCompare(b);
        });
};

export { isValidSchemasName, isValidVibraryName, isVibraryNameIncluded, listVibraryFiles, vibraryIncludeExistsAsync };
