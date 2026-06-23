// Canonicalizes truth XML into one deterministic, fully order-insensitive form: reordering fields within a <truth>,
// reordering whole <truth> entries, or reordering items inside <relatesTo>/<labels> all collapse to identical output.
// scripts/truths-diff.js uses this to decide whether two versions are semantically equal. Run
// directly (`node scripts/canonicalize-truths.js <file>`) it prints the canonical form, as an inspection utility.
//
// The parse/serialize round-trip (canonical field order + indentation) is reused from the app's core. The extra sort
// pass below lives only here - the app's save path must keep the file's own entry/list order.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { parseTruthsXml, serializeTruthsXml } from '../frontend/src/truthsXmlCore.js';

// Deterministic, locale-independent ordering by code unit.
const compare = function (a, b) {
    if (a < b) {
        return -1;
    }
    if (a > b) {
        return 1;
    }
    return 0;
};

// approved needs no sort: it is a single string field, so it is already canonical.
const sortLists = function (truth) {
    return {
        ...truth,
        relatesTo: truth.relatesTo.toSorted(compare),
        labels: truth.labels.toSorted(compare)
    };
};

const canonicalize = function (xml) {
    const truths = parseTruthsXml(xml).map(function (truth) {
        return sortLists(truth);
    });

    // Sort entries by <title>, then by the entry's own canonical text as a deterministic tiebreak so blank or
    // duplicate titles cannot leave a residual diff.
    const keyed = truths.map(function (truth) {
        return { truth, key: serializeTruthsXml([truth]) };
    });
    keyed.sort(function (a, b) {
        return compare(a.truth.title, b.truth.title) || compare(a.key, b.key);
    });

    return serializeTruthsXml(keyed.map(function (entry) {
        return entry.truth;
    }));
};

const main = function () {
    let xml;
    try {
        xml = readFileSync(process.argv[2], 'utf8');
    } catch {
        // File unreadable (for example the /dev/null side of an add/delete) - nothing to normalize.
        return;
    }

    try {
        process.stdout.write(canonicalize(xml));
    } catch {
        // Malformed XML (or anything else) - fall back to the raw bytes so the diff still works and never errors out.
        process.stdout.write(xml);
    }
};

// Run the CLI only when executed directly, not when imported by scripts/truths-diff.js.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}

export { canonicalize };
