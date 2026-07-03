// Canonicalizes a vibrary XML file into one deterministic, fully order-insensitive form: reordering fields within an
// <entry>, reordering whole <entry> elements, or reordering items inside <relatesTo>/<labels> all collapse to identical
// output. scripts/vibrary-diff.js uses this to decide whether two versions are semantically equal. Run directly
// (`node scripts/canonicalize-vibrary.js <file>`) it prints the canonical form, as an inspection utility.
//
// The parse/serialize round-trip (canonical field order + indentation) is reused from the app's core. The extra sort
// pass below lives only here - the app's save path must keep the file's own entry/list order.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { parseVibraryXml, serializeVibraryXml } from '../shared/vibraryXmlCore.js';

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
const sortLists = function (spec) {
    return {
        ...spec,
        relatesTo: spec.relatesTo.toSorted(compare),
        labels: spec.labels.toSorted(compare)
    };
};

const canonicalize = function (xml) {
    const entries = parseVibraryXml(xml);
    const sorted = entries.map(function (spec) {
        return sortLists(spec);
    });

    // Sort entries by <title>, then by the entry's own canonical text as a deterministic tiebreak so blank or
    // duplicate titles cannot leave a residual diff.
    const keyed = sorted.map(function (spec) {
        return { spec, key: serializeVibraryXml([spec]) };
    });
    keyed.sort(function (a, b) {
        return compare(a.spec.title, b.spec.title) || compare(a.key, b.key);
    });

    return serializeVibraryXml(keyed.map(function (entry) {
        return entry.spec;
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
    } catch (error) {
        // Malformed XML (or anything else) - fall back to the raw bytes so the diff still works and never errors out.
        // Say so on stderr, so a systematic failure (e.g. core API drift) cannot masquerade as "already canonical".
        process.stderr.write(`canonicalize-vibrary: falling back to raw bytes (${error.message})\n`);
        process.stdout.write(xml);
    }
};

// Run the CLI only when executed directly, not when imported by scripts/vibrary-diff.js.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}

export { canonicalize };
