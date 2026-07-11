import { createRequire } from 'node:module';

// The published package uses Node APIs tied to the engines floor (Array.prototype.toSorted, and native TypeScript type
// stripping for the tests). npm only WARNS on an unmet engines range unless engine-strict is set, so a user on older
// Node installs fine and then hits a cryptic runtime crash from a missing method. The bin entries call this first to
// fail fast with a clear message instead. Kept to old-Node-safe syntax so the check itself always runs, and the bins
// load the rest of the app only after it passes (via dynamic import) so nothing newer is evaluated beforehand.
const require = createRequire(import.meta.url);
const packageJson = require('../../package.json');

// engines.node is a range like ">=22.18.0"; keep the bare "major.minor.patch" for the numeric comparison.
const REQUIRED_RANGE = packageJson.engines.node;
const REQUIRED_VERSION = REQUIRED_RANGE.replaceAll(/[^0-9.]/g, '');

// True when `current` ("vX.Y.Z" or "X.Y.Z") is older than `required` ("X.Y.Z"), compared numerically segment by
// segment (a plain string compare would rank "9" above "22"). Exported for testing.
const isVersionBelow = function (current, required) {
    const currentParts = current.replace(/^v/, '').split('.').map(Number);
    const requiredParts = required.split('.').map(Number);
    for (const [index, requiredPart] of requiredParts.entries()) {
        const currentPart = currentParts[index] || 0;
        if (currentPart < requiredPart) {
            return true;
        }
        if (currentPart > requiredPart) {
            return false;
        }
    }
    return false;
};

// Print a clear message and return false when the running Node is older than the engines floor, so a bin entry can set
// a non-zero exit code and stop rather than the app crashing later with an opaque missing-API error. True otherwise.
const isSupportedNodeVersion = function () {
    if (isVersionBelow(process.version, REQUIRED_VERSION)) {
        console.error(`vibrary requires Node.js ${REQUIRED_RANGE} but is running on ${process.version}. Please upgrade Node.js.`);
        return false;
    }
    return true;
};

export { isSupportedNodeVersion, isVersionBelow };
