import { mkdir, readdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { randomId } from '../../shared/vibraryXmlCore.js';

// Finished agent-run transcripts, persisted per served folder so they survive server restarts (and outlive the
// Claude CLI's own 30-day session cleanup). Machine-local like the settings file - transcripts routinely contain
// project file contents, so they are kept out of version control by the same .vibrary ignore block.
const TRANSCRIPTS_RELATIVE_PATH = path.join('.vibrary', 'transcripts');

// Newest transcripts kept; older ones are pruned after every save. Generous - hundreds of runs - because the whole
// point is history, but bounded so a long-lived folder cannot grow an unbounded transcript pile nobody asked for.
const MAX_TRANSCRIPTS = 200;

// A single run's stream can reach thousands of NDJSON lines; past this cap the tail is dropped and the record says
// so, keeping one pathological run from producing a transcript file too large to ever load back.
const MAX_TRANSCRIPT_LINES = 5000;

// File names carry the whole listing metadata - start time, outcome, a route slug, and a short id - so the history
// list is a pure directory read with zero file opens (a transcript file can be hundreds of KB; opening 200 of them
// to build a list would make the History section cost more than the runs it describes). The ISO start time leads
// (filesystem-hostile characters folded to hyphens), so a plain name sort IS a chronological sort - the pruner and
// the listing both lean on that.
const NAME_REGEX = /^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)-(success|error|aborted)-([a-z0-9-]*)-([a-z0-9]{8})\.json$/;

// The route, reduced to a safe slug for the file name: "/api/apply-batch" -> "apply-batch". Length-capped so a
// bizarre URL cannot produce an unwieldy file name.
const routeSlug = function (route) {
    return route.replaceAll(/[^a-zA-Z0-9]+/g, '-').replaceAll(/^-*api-|-+$/g, '').toLowerCase().slice(0, 40);
};

const transcriptFileName = function (record) {
    const id = randomId().replaceAll('-', '').slice(0, 8).padEnd(8, '0').toLowerCase();
    return `${record.startedAt.replaceAll(/[:.]/g, '-')}-${record.outcome}-${routeSlug(record.route)}-${id}.json`;
};

// Reverse of the name encoding: the listing entry for one file, or null for a foreign file someone dropped in the
// directory (ignored rather than crashing the list).
const parseTranscriptName = function (name) {
    const match = NAME_REGEX.exec(name);
    if (match === null) {
        return null;
    }
    const [, timeSafe, outcome, route] = match;
    const [date, time] = timeSafe.split('T', 2);
    const startedAt = `${date}T${time.replace(/^(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, '$1:$2:$3.$4Z')}`;
    return { name, startedAt, outcome, route };
};

// Write one finished run's record and prune beyond the cap. Persistence is strictly best-effort: a failure is logged
// and swallowed, because the run itself already succeeded or failed on its own terms and a transcript-disk problem
// must never turn into a failed agent response.
const saveTranscriptAsync = async function (cwd, record) {
    const directory = path.resolve(cwd, TRANSCRIPTS_RELATIVE_PATH);
    try {
        await mkdir(directory, { recursive: true });
        await writeFile(path.join(directory, transcriptFileName(record)), `${JSON.stringify(record, null, 4)}\n`, 'utf8');
        const names = (await readdir(directory)).filter(function (name) { return name.endsWith('.json'); });
        if (names.length > MAX_TRANSCRIPTS) {
            const doomed = names.toSorted(function (a, b) { return a.localeCompare(b); }).slice(0, names.length - MAX_TRANSCRIPTS);
            await Promise.all(doomed.map(function (name) { return unlink(path.join(directory, name)); }));
        }
    } catch (error) {
        console.error('Failed to persist an agent transcript:', error);
    }
};

// The history list, newest first, decoded purely from file names. A missing directory is the normal
// nothing-persisted-yet state; foreign files are skipped.
const listTranscriptsAsync = async function (cwd) {
    const directory = path.resolve(cwd, TRANSCRIPTS_RELATIVE_PATH);
    let names;
    try {
        names = await readdir(directory);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return [];
        }
        throw error;
    }
    return names
        .map(function (name) { return parseTranscriptName(name); })
        .filter(function (entry) { return entry !== null; })
        .toSorted(function (a, b) { return b.name.localeCompare(a.name); });
};

// One stored record by its listing name. The strict name shape (enforced with the same regex the encoder satisfies)
// is what keeps path-shaped input out of the filesystem entirely; a name that fails it, or a file since pruned,
// resolves to null for the route to 404.
const readTranscriptAsync = async function (cwd, name) {
    if (!NAME_REGEX.test(name)) {
        return null;
    }
    const filePath = path.join(path.resolve(cwd, TRANSCRIPTS_RELATIVE_PATH), name);
    try {
        return JSON.parse(await readFile(filePath, 'utf8'));
    } catch {
        return null;
    }
};

// Delete one record by name (same strict-shape gate); resolves with whether anything was actually removed.
const deleteTranscriptAsync = async function (cwd, name) {
    if (!NAME_REGEX.test(name)) {
        return false;
    }
    try {
        await unlink(path.join(path.resolve(cwd, TRANSCRIPTS_RELATIVE_PATH), name));
        return true;
    } catch {
        return false;
    }
};

// Drop the whole history: remove the directory itself (recreated on the next save).
const clearTranscriptsAsync = async function (cwd) {
    await rm(path.resolve(cwd, TRANSCRIPTS_RELATIVE_PATH), { recursive: true, force: true });
};

export { clearTranscriptsAsync, deleteTranscriptAsync, listTranscriptsAsync, MAX_TRANSCRIPT_LINES, MAX_TRANSCRIPTS, readTranscriptAsync, saveTranscriptAsync, TRANSCRIPTS_RELATIVE_PATH };
