import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';

import writeFileAtomic from 'write-file-atomic';

import { nowTimestamp, randomId } from '../../shared/vibraryXmlCore.js';
import { resolveWithinCwd } from '../shared/resolveWithinCwd.js';

// The rankings sidecar lives at the served folder root as a peer of the vibrary XML files (not under .vibrary/ like
// the machine-local settings): match results are shared project data the user may well commit, exactly like the
// entries they rank. Entries are identified by title, the same convention relatesTo uses.
const RANKINGS_FILE_NAME = 'vibrary-rankings.json';

// Far above any realistic match log (a match record is a few hundred bytes) but a hard stop against a runaway client
// growing a file that every standings request then re-reads and replays.
const MAX_RANKINGS_BYTES = 4 * 1024 * 1024;

const JUDGES = new Set(['AI', 'Human']);

// One human-readable problem with a would-be match record, or null when the record is valid. Used on both read and
// write: the file is user-editable JSON, so a hand-edit mistake surfaces as a precise message ("match 3: ...") the UI
// can show next to the file name, rather than a crash - and never as a silent drop, which would lose the record on
// the next read-modify-write cycle.
const describeMatchProblem = function (record) {
    if (record === null || typeof record !== 'object' || Array.isArray(record)) {
        return 'is not an object';
    }
    if (typeof record.id !== 'string' || record.id === '') {
        return 'is missing an id';
    }
    if (typeof record.playedAt !== 'string' || Number.isNaN(Date.parse(record.playedAt))) {
        return 'has no parseable playedAt timestamp';
    }
    if (typeof record.firstTitle !== 'string' || record.firstTitle === '' ||
    typeof record.secondTitle !== 'string' || record.secondTitle === '') {
        return 'needs firstTitle and secondTitle';
    }
    if (record.firstTitle === record.secondTitle) {
        return 'pits an entry against itself';
    }
    if (record.winnerTitle !== record.firstTitle && record.winnerTitle !== record.secondTitle) {
        return 'names a winner that is neither contender';
    }
    if (!JUDGES.has(record.judge)) {
        return 'needs a judge of AI or Human';
    }
    if (typeof record.rationale !== 'string') {
        return 'has a non-text rationale';
    }
    return null;
};

// Builds a complete match record from the fields a caller decides (who met, who won, which judge, why), stamping the
// id and timestamp here so every creation path - manual result, AI competition - produces the same shape. The guarded
// randomId (not crypto.randomUUID directly) matters: recording a manual result from a phone over plain LAN HTTP is a
// supported context where crypto.randomUUID may not exist.
const createMatch = function ({ firstTitle, secondTitle, winnerTitle, judge, rationale = '' }) {
    return { id: randomId(), playedAt: nowTimestamp(), firstTitle, secondTitle, winnerTitle, judge, rationale };
};

const rankingsPath = function (cwd) {
    return resolveWithinCwd(cwd, RANKINGS_FILE_NAME);
};

// Reads the match log. A missing file is the normal first-run state and yields an empty log; anything else that is
// wrong - unparseable JSON, a shape other than { matches: [...] }, an invalid record - throws one clear Error naming
// the file and the first problem, because a rankings request built on a half-understood log would quietly rank on
// partial data. The caller turns the message into an HTTP error the UI shows verbatim.
const readRankingsAsync = async function (cwd) {
    let content;
    try {
        content = await readFile(rankingsPath(cwd), 'utf8');
    } catch (error) {
        if (error.code === 'ENOENT') {
            return { matches: [] };
        }
        throw error;
    }
    let parsed;
    try {
        parsed = JSON.parse(content);
    } catch (error) {
        throw new Error(`${RANKINGS_FILE_NAME} is not valid JSON: ${error.message}`, { cause: error });
    }
    if (parsed === null || typeof parsed !== 'object' || !Array.isArray(parsed.matches)) {
        throw new Error(`${RANKINGS_FILE_NAME} must be an object with a "matches" array`);
    }
    for (const [index, record] of parsed.matches.entries()) {
        const problem = describeMatchProblem(record);
        if (problem !== null) {
            throw new Error(`${RANKINGS_FILE_NAME} match ${index + 1} ${problem}`);
        }
    }
    return { matches: parsed.matches };
};

// Atomic replace, like every other write in the app: a crash mid-write must not leave a truncated match log.
const writeMatchesAsync = async function (cwd, matches) {
    const serialized = JSON.stringify({ matches }, null, 4);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_RANKINGS_BYTES) {
        throw new Error(`${RANKINGS_FILE_NAME} would exceed its size limit; discard some match results first`);
    }
    await writeFileAtomic(rankingsPath(cwd), `${serialized}\n`, { encoding: 'utf8' });
};

// Appends validated records to the log. Validation happens BEFORE the read-modify-write so a bad record cannot cost a
// disk read, and again implicitly on read so a concurrent hand-edit that broke the file surfaces here too.
const addMatchesAsync = async function (cwd, records) {
    for (const record of records) {
        const problem = describeMatchProblem(record);
        if (problem !== null) {
            throw new Error(`match ${problem}`);
        }
    }
    const { matches } = await readRankingsAsync(cwd);
    const combined = [...matches, ...records];
    await writeMatchesAsync(cwd, combined);
    return combined;
};

// Removes the records whose ids are listed (one, many, or all - the discard UI's three grades) and reports how many
// actually went, so the UI can say "3 results discarded" truthfully even when some ids were already gone.
const removeMatchesAsync = async function (cwd, ids) {
    const doomed = new Set(ids);
    const { matches } = await readRankingsAsync(cwd);
    const kept = matches.filter(function (record) { return !doomed.has(record.id); });
    if (kept.length !== matches.length) {
        await writeMatchesAsync(cwd, kept);
    }
    return { matches: kept, removed: matches.length - kept.length };
};

export { addMatchesAsync, createMatch, describeMatchProblem, RANKINGS_FILE_NAME, readRankingsAsync, removeMatchesAsync };
