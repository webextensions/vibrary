import { glob } from 'glob';

// Matches exactly "truths.xml" or "truths-<something>.xml". The character class for the suffix excludes path
// separators, so a valid name can never traverse out of the working directory.
const TRUTHS_NAME_REGEX = /^truths(-[A-Za-z0-9._-]+)?\.xml$/;

const isValidTruthsName = function (name) {
    return typeof name === 'string' && TRUTHS_NAME_REGEX.test(name);
};

const listTruthsFiles = async function (cwd) {
    const matches = await glob('truths*.xml', { cwd, nodir: true });
    return matches
        .filter(function (name) {
            return isValidTruthsName(name);
        })
        .toSorted(function (a, b) {
            return a.localeCompare(b);
        });
};

export { isValidTruthsName, listTruthsFiles };
