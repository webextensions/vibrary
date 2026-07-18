import { readFile } from 'node:fs/promises';

import { approvalState, countApprovedSpecs, parseVibraryXml } from '../../shared/vibraryXmlCore.js';
import { listVibraryFiles, vibraryIncludeExistsAsync } from './vibraryFiles.js';
import { resolveWithinCwd } from '../shared/resolveWithinCwd.js';

// One pass over the included files collecting every problem worth failing a build over, plus the per-file tallies the
// CLI's `list` command prints. Deliberately the SAME rules the UI shows as badges (the sidebar's broken-reference
// count, the duplicate-title warning, the file-level "!" for an unparseable file), reusing the same helpers
// (listVibraryFiles, parseVibraryXml, approvalState), so `vibrary check` and the app can never disagree about whether
// a folder is healthy - a checker with its own copy of the rules would drift within a release.
//
// `configured` is reported apart from the problems: a folder with no .vibraryinclude matches NOTHING, so a scan there
// is trivially empty and must read as "unconfigured" (the CLI exits 2), never as "clean" - a silently vacuous CI gate
// is worse than no gate.
const checkVibraryAsync = async function (cwd, { requireApproved = false } = {}) {
    if (!(await vibraryIncludeExistsAsync(cwd))) {
        return { configured: false, files: [], problems: [] };
    }
    const names = await listVibraryFiles(cwd);
    const parsed = [];
    const problems = [];

    for (const name of names) {
        // The names are glob-derived, but the shared defense-in-depth guard applies before ANY filesystem access -
        // the same treatment the routes give this listing (see resolveWithinCwd.js).
        const target = resolveWithinCwd(cwd, name);
        if (target === null) {
            continue;
        }
        try {
            parsed.push({ name, entries: parseVibraryXml(await readFile(target, 'utf8')) });
        } catch (error) {
            problems.push({ kind: 'unparseable', file: name, detail: error.message });
            parsed.push({ name, entries: null });
        }
    }

    // Untitled entries are excluded: they cannot be referenced (relatesTo resolves by title) and an empty string
    // colliding with another empty string is not a duplicate anyone means.
    const knownTitles = new Set(parsed.flatMap(function (file) {
        return file.entries === null ? [] : file.entries.map(function (entry) { return entry.title; }).filter(function (title) { return title !== ''; });
    }));
    const firstSeenIn = new Map();

    for (const file of parsed) {
        if (file.entries === null) {
            continue;
        }
        for (const entry of file.entries) {
            if (entry.title !== '' && firstSeenIn.has(entry.title)) {
                // Folder-wide duplicate: relatesTo resolves to the FIRST occurrence, so the later one is unreachable.
                problems.push({ kind: 'duplicate-title', file: file.name, title: entry.title, alsoIn: firstSeenIn.get(entry.title) });
            } else if (entry.title !== '') {
                firstSeenIn.set(entry.title, file.name);
            }
            for (const reference of entry.relatesTo) {
                if (!knownTitles.has(reference)) {
                    problems.push({ kind: 'broken-reference', file: file.name, title: entry.title, reference });
                }
            }
            // approvalState answers 'none' | 'current' | 'stale'; anything but 'current' fails the stricter gate.
            const state = approvalState(entry);
            if (requireApproved && state !== 'current') {
                problems.push({ kind: 'unapproved', file: file.name, title: entry.title, state });
            }
        }
    }

    const files = parsed.map(function (file) {
        if (file.entries === null) {
            return { name: file.name, approved: null, total: null, brokenReferences: null };
        }
        const references = file.entries.flatMap(function (entry) { return entry.relatesTo; });
        return {
            name: file.name,
            approved: countApprovedSpecs(file.entries),
            total: file.entries.length,
            brokenReferences: references.filter(function (reference) { return !knownTitles.has(reference); }).length
        };
    });
    return { configured: true, files, problems };
};

export { checkVibraryAsync };
