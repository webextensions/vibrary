// Owns `.block-non-keyboard-characters.suppressions.json` - the one file holding both data sections
// of the non-keyboard-character tooling:
//
//   - "baseline" (machine-owned): per-file counts of the suppressed characters. The guard's
//     --suppress rewrites this section wholesale; the guard fails on any drift from it.
//   - "exemptions" (human-owned): ordered glob entries for files the tooling skips entirely
//     (matching semantics live in exempted-files.ts). --suppress preserves this section.
//
// Reading validates the shape and fails loudly on anything unrecognized - including the retired
// flat counts-only format - so a typo cannot silently disable an exemption. The validation is a
// pure function of the parsed JSON (parseSuppressionsFileData) so tests can exercise it without
// touching the real file.

import fs from 'node:fs';
import path from 'node:path';

type CountsByChar = Record<string, number>;
type CountsByFile = Record<string, CountsByChar>;

interface ExemptionEntry {
    pattern: string;        // plain repo-root-relative glob; a leading "!" re-includes
    reason?: string;        // why it is exempt (documentary)
    skipInCensus?: boolean  // default true; false = the census still counts the file
}

interface SuppressionsFileData {
    baseline: CountsByFile;
    exemptions: ExemptionEntry[]
}

const projectRoot = path.resolve(import.meta.dirname, '..', '..', '..', '..');
// The suppressions file lives at the project root as a hidden dotfile.
const suppressionsRelativePath = '.block-non-keyboard-characters.suppressions.json';
const suppressionsPath = path.join(projectRoot, suppressionsRelativePath);

const isPlainObject = function (value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
};

// Returned (not thrown) so call sites `throw formatError(...)` - the explicit `throw` lets tsc
// narrow the guarded value after the `if` (it does not apply never-call analysis to a plain call
// of a const function expression).
const formatError = function (message: string): Error {
    return new Error(`${suppressionsRelativePath}: ${message}`);
};

const validateBaseline = function (value: unknown): CountsByFile {
    if (!isPlainObject(value)) {
        throw formatError('"baseline" must be an object mapping file paths to per-character counts');
    }
    for (const [file, counts] of Object.entries(value)) {
        if (!isPlainObject(counts)) {
            throw formatError(`"baseline" entry for "${file}" must be an object mapping characters to counts`);
        }
        for (const [char, count] of Object.entries(counts)) {
            if (typeof count !== 'number') {
                throw formatError(`"baseline" count for "${file}" / "${char}" must be a number`);
            }
        }
    }
    return value as CountsByFile;
};

const EXEMPTION_ENTRY_KEYS = new Set(['pattern', 'reason', 'skipInCensus']);

const validateExemptions = function (value: unknown): ExemptionEntry[] {
    if (!Array.isArray(value)) {
        throw formatError('"exemptions" must be an array of { pattern, reason, skipInCensus } entries');
    }
    return value.map(function (entry: unknown, index: number): ExemptionEntry {
        if (!isPlainObject(entry)) {
            throw formatError(`"exemptions"[${index}] must be an object`);
        }
        for (const key of Object.keys(entry)) {
            if (!EXEMPTION_ENTRY_KEYS.has(key)) {
                throw formatError(`"exemptions"[${index}] has an unknown key "${key}"`);
            }
        }
        const { pattern, reason, skipInCensus } = entry;
        if (typeof pattern !== 'string' || pattern === '' || pattern === '!') {
            throw formatError(`"exemptions"[${index}] needs a non-empty string "pattern"`);
        }
        if (pattern.endsWith('/')) {
            throw formatError(`"exemptions"[${index}] pattern "${pattern}" ends with "/" and would match nothing - use "${pattern}**" to exempt the subtree`);
        }
        if (reason !== undefined && typeof reason !== 'string') {
            throw formatError(`"exemptions"[${index}] "reason" must be a string`);
        }
        if (skipInCensus !== undefined && typeof skipInCensus !== 'boolean') {
            throw formatError(`"exemptions"[${index}] "skipInCensus" must be a boolean`);
        }
        // The optional fields are validated above; the casts just carry that through (tsc does not
        // keep compound narrowings of `unknown` destructured values).
        return {
            pattern,
            reason: reason as string | undefined,
            skipInCensus: skipInCensus as boolean | undefined
        };
    });
};

// Pure validation of the parsed JSON. Both sections are optional (an absent section is empty), but
// any other shape - notably the retired flat counts-only format - errors out.
const parseSuppressionsFileData = function (parsed: unknown): SuppressionsFileData {
    if (!isPlainObject(parsed)) {
        throw formatError('must be a JSON object with "baseline" and/or "exemptions" keys');
    }
    for (const key of Object.keys(parsed)) {
        if (key !== 'baseline' && key !== 'exemptions') {
            throw formatError(`unrecognized top-level key "${key}" (expected only "baseline" / "exemptions")`);
        }
    }
    return {
        baseline: parsed.baseline === undefined ? {} : validateBaseline(parsed.baseline),
        exemptions: parsed.exemptions === undefined ? [] : validateExemptions(parsed.exemptions)
    };
};

const readSuppressionsFile = function (): SuppressionsFileData {
    let content: string;
    try {
        content = fs.readFileSync(suppressionsPath, 'utf8');
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            return { baseline: {}, exemptions: [] };
        }
        throw err;
    }
    return parseSuppressionsFileData(JSON.parse(content));
};

// Rewrite the machine-owned "baseline" section (file and character keys sorted, for a deterministic
// diff) while preserving the human-owned "exemptions" section, whose order is meaningful (last
// match wins - see exempted-files.ts).
const writeBaseline = function (baseline: CountsByFile): void {
    const { exemptions } = readSuppressionsFile();
    const sortedBaseline: CountsByFile = {};
    for (const file of Object.keys(baseline).toSorted()) {
        const counts = baseline[file];
        const sortedCounts: CountsByChar = {};
        for (const char of Object.keys(counts).toSorted()) {
            sortedCounts[char] = counts[char];
        }
        sortedBaseline[file] = sortedCounts;
    }
    fs.writeFileSync(suppressionsPath, JSON.stringify({ baseline: sortedBaseline, exemptions }, null, 4) + '\n');
};

export type {
    CountsByChar,
    CountsByFile,
    ExemptionEntry
};
export {
    parseSuppressionsFileData,
    readSuppressionsFile,
    suppressionsRelativePath,
    writeBaseline
};
