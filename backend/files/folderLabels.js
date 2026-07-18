import { readFile } from 'node:fs/promises';

import { parseVibraryXml } from '../../shared/vibraryXmlCore.js';
import { listVibraryFiles } from './vibraryFiles.js';
import { resolveWithinCwd } from '../shared/resolveWithinCwd.js';

// Labels land inside the generate prompt, which is handed to claude as a single argv argument the MAX_PROMPT_BYTES
// guard has ALREADY passed (the guard measures the user-supplied text, not server-side additions like this one). So
// the vocabulary must be bounded here: sorted first for determinism, then accumulated until the byte budget is spent,
// dropping the tail. Generous for any sane folder - it exists to keep a pathological one from blowing the argv cap.
const MAX_LABELS_BYTES = 4 * 1024;

// The folder's label vocabulary: every distinct label across every included file, sorted, byte-bounded. Files that
// cannot be read or parsed are skipped (their labels are unknowable, and the vocabulary is advisory - a prompt hint
// and an input suggestion list, never a gate).
const collectFolderLabelsAsync = async function (cwd) {
    const names = await listVibraryFiles(cwd);
    const labels = new Set();
    for (const name of names) {
        const target = resolveWithinCwd(cwd, name);
        if (target === null) {
            continue;
        }
        try {
            const entries = parseVibraryXml(await readFile(target, 'utf8'));
            for (const entry of entries) {
                for (const label of entry.labels) {
                    labels.add(label);
                }
            }
        } catch {
            continue;
        }
    }
    const sorted = [...labels].toSorted(function (a, b) {
        return a.localeCompare(b);
    });
    const bounded = [];
    let bytes = 0;
    for (const label of sorted) {
        bytes += Buffer.byteLength(label, 'utf8') + 2;
        if (bytes > MAX_LABELS_BYTES) {
            break;
        }
        bounded.push(label);
    }
    return bounded;
};

export { collectFolderLabelsAsync };
