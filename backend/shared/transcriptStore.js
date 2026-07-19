import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
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

// File names lead with the start time (ISO with filesystem-hostile characters folded to hyphens), so a plain name
// sort IS a chronological sort - the pruner and any directory listing lean on that.
const transcriptFileName = function (startedAt) {
    return `${startedAt.replaceAll(/[:.]/g, '-')}-${randomId().slice(0, 8)}.json`;
};

// Write one finished run's record and prune beyond the cap. Persistence is strictly best-effort: a failure is logged
// and swallowed, because the run itself already succeeded or failed on its own terms and a transcript-disk problem
// must never turn into a failed agent response.
const saveTranscriptAsync = async function (cwd, record) {
    const directory = path.resolve(cwd, TRANSCRIPTS_RELATIVE_PATH);
    try {
        await mkdir(directory, { recursive: true });
        await writeFile(path.join(directory, transcriptFileName(record.startedAt)), `${JSON.stringify(record, null, 4)}\n`, 'utf8');
        const names = (await readdir(directory)).filter(function (name) { return name.endsWith('.json'); });
        if (names.length > MAX_TRANSCRIPTS) {
            const doomed = names.toSorted(function (a, b) { return a.localeCompare(b); }).slice(0, names.length - MAX_TRANSCRIPTS);
            await Promise.all(doomed.map(function (name) { return unlink(path.join(directory, name)); }));
        }
    } catch (error) {
        console.error('Failed to persist an agent transcript:', error);
    }
};

export { MAX_TRANSCRIPT_LINES, MAX_TRANSCRIPTS, saveTranscriptAsync, TRANSCRIPTS_RELATIVE_PATH };
