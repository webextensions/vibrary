import { readFile } from 'node:fs/promises';

import { Router } from 'express';

import { MAX_COMPETITION_COUNT } from '../../shared/apiLimits.js';
import { ENTRY_TYPES, parseVibraryXml } from '../../shared/vibraryXmlCore.js';
import { listVibraryFiles } from '../files/vibraryFiles.js';
import { resolveWithinCwd } from '../shared/resolveWithinCwd.js';
import { sendErrorResponse, sendSuccessResponse } from '../shared/sendResponse.js';
import { MAX_PROMPT_BYTES, PROMPT_TOO_LARGE_MESSAGE, promptBytes, streamClaudeRoute } from '../shared/streamClaudeRoute.js';
import { readSettingsAsync } from '../settings/settingsStore.js';
import { replayMatches, selectLeastMetPairings } from './eloRankings.js';
import { addMatchesAsync, createMatch, readRankingsAsync, removeMatchesAsync } from './rankingsStore.js';
import { buildCompetitionPrompt, judgeCompetitionAsync } from './runClaudeCompetition.js';

// How many head-to-head suggestions the payload carries for the compare UI. A small buffer (not just one) lets the
// client advance through a few pairs without a round trip after each vote; it re-fetches long before running out.
const SUGGESTED_PAIRING_COUNT = 8;

// Every entry title in the folder mapped to { type, content, notes, labels }, first occurrence winning - the same
// folder-wide, first-in-listing-order resolution rule relatesTo references use, so the rankings agree with the
// editor about which entry a duplicated title means. Content and notes ride along for the competition judge's
// prompt, labels for the scope filter. Unreadable files are skipped exactly as the listing badges skip them.
const collectFolderTitlesAsync = async function (cwd) {
    const names = await listVibraryFiles(cwd);
    const titles = new Map();
    for (const name of names) {
        const target = resolveWithinCwd(cwd, name);
        if (target === null) {
            continue;
        }
        try {
            const entries = parseVibraryXml(await readFile(target, 'utf8'));
            for (const entry of entries) {
                if (entry.title !== '' && !titles.has(entry.title)) {
                    titles.set(entry.title, { type: entry.type, content: entry.content, notes: entry.notes, labels: entry.labels });
                }
            }
        } catch {
            continue;
        }
    }
    return titles;
};

// The competition scope: which entry types' titles compete. Ideas are the default - ranking a raw idea backlog is the
// feature's reason to exist - but any mix can be requested (e.g. ranking specs before an implementation push).
const parseTypesParameter = function (parameter) {
    if (typeof parameter !== 'string' || parameter === '') {
        return ['idea'];
    }
    const types = parameter.split(',').filter(function (type) { return type !== ''; });
    return types.every(function (type) { return ENTRY_TYPES.includes(type); }) ? types : null;
};

// The scope's optional label leg: freeform (labels are user-coined, so there is nothing to validate against), empty
// meaning no label constraint - the same "empty imposes nothing" rule the editor's filters use.
const parseLabelsParameter = function (parameter) {
    if (typeof parameter !== 'string' || parameter === '') {
        return [];
    }
    return parameter.split(',').filter(function (label) { return label !== ''; });
};

// Whether an entry competes under the given scope: its type must be selected, and when labels are set it must carry
// at least one of them.
const isInScope = function (entry, types, labels) {
    return types.includes(entry.type) && (labels.length === 0 || entry.labels.some(function (label) { return labels.includes(label); }));
};

// The full rankings picture in one payload: scoped standings, the entire match history (annotated, never filtered -
// discarding is the user's decision, not the server's), and suggested next pairings. Standings replay only the
// matches whose contenders BOTH currently resolve to in-scope entries: a match against a renamed or deleted entry
// (orphaned) or an out-of-scope one is kept on disk but sits out of the replay, so the board always reflects entries
// that actually exist right now, and repairing a title brings its history straight back.
const buildRankingsPayloadAsync = async function (cwd, types, labels) {
    const [{ matches }, titlesByName] = await Promise.all([readRankingsAsync(cwd), collectFolderTitlesAsync(cwd)]);
    const scoped = new Set();
    for (const [title, entry] of titlesByName) {
        if (isInScope(entry, types, labels)) {
            scoped.add(title);
        }
    }
    const annotated = matches.map(function (match) {
        const orphanedTitles = [match.firstTitle, match.secondTitle].filter(function (title) {
            return !titlesByName.has(title);
        });
        return { ...match, orphanedTitles };
    });
    const replayable = matches.filter(function (match) {
        return scoped.has(match.firstTitle) && scoped.has(match.secondTitle);
    });
    const standings = replayMatches(replayable, [...scoped]);
    const suggestedPairings = selectLeastMetPairings([...scoped], replayable, SUGGESTED_PAIRING_COUNT);
    return { standings, matches: annotated, types, labels, suggestedPairings };
};

const createRankingsRouter = function ({ cwd }) {
    const router = Router();

    // A broken vibrary-rankings.json is a state-on-disk problem the user can fix (it is their editable file), so its
    // message passes through on a 409 rather than vanishing into a generic 500 - the same philosophy as the editor's
    // repair flow for unparseable XML.
    const sendStoreError = function (response, error) {
        return sendErrorResponse(response, 409, error.message);
    };

    router.get('/rankings', async function (request, response) {
        const types = parseTypesParameter(request.query.types);
        if (types === null) {
            return sendErrorResponse(response, 400, 'Unknown entry type in "types"');
        }
        const labels = parseLabelsParameter(request.query.labels);
        try {
            return sendSuccessResponse(response, await buildRankingsPayloadAsync(cwd, types, labels));
        } catch (error) {
            return sendStoreError(response, error);
        }
    });

    // Records one manual result. The judge is always Human here - the AI judge writes through the competition run
    // route, not this one - so a client cannot forge an AI verdict. Both contenders must currently exist: a manual
    // result is an act of prioritizing the backlog as it stands, unlike historical records which may go orphaned.
    router.post('/rankings/matches', async function (request, response) {
        const { firstTitle, secondTitle, winnerTitle, rationale, types: bodyTypes, labels: bodyLabels } = request.body || {};
        const types = parseTypesParameter(bodyTypes);
        if (types === null) {
            return sendErrorResponse(response, 400, 'Unknown entry type in "types"');
        }
        const labels = parseLabelsParameter(bodyLabels);
        const titlesByName = await collectFolderTitlesAsync(cwd);
        for (const title of [firstTitle, secondTitle]) {
            if (typeof title !== 'string' || !titlesByName.has(title)) {
                return sendErrorResponse(response, 400, `No entry is titled "${title}"`);
            }
        }
        const record = createMatch({
            firstTitle,
            secondTitle,
            winnerTitle,
            judge: 'Human',
            rationale: typeof rationale === 'string' ? rationale : ''
        });
        try {
            await addMatchesAsync(cwd, [record]);
            return sendSuccessResponse(response, { match: record, ...await buildRankingsPayloadAsync(cwd, types, labels) });
        } catch (error) {
            // createMatch built the record from client fields, so a validation message here ("names a winner that is
            // neither contender") describes the request, not the file on disk.
            return sendErrorResponse(response, 400, error.message);
        }
    });

    // Run AI-judged competitions: `count` least-met pairings, each judged by its own buffered claude run inside ONE
    // streamed job (so the whole batch occupies the single agent slot exactly once and the activity queue treats it
    // as one unit of work). Every settled pairing is recorded to the log IMMEDIATELY - an abort or a mid-batch judge
    // failure keeps the verdicts already earned - and streamed to the client as a competition_result line, with each
    // pairing's exact judge prompt on its competition_start line (every agent run's prompt stays inspectable, the
    // Activity monitor's standing promise).
    router.post('/rankings/competitions', async function (request, response) {
        const { count, instructions, types: bodyTypes, labels: bodyLabels } = request.body || {};
        const types = parseTypesParameter(bodyTypes);
        if (types === null) {
            return sendErrorResponse(response, 400, 'Unknown entry type in "types"');
        }
        if (!Number.isSafeInteger(count) || count < 1 || count > MAX_COMPETITION_COUNT) {
            return sendErrorResponse(response, 400, `Expected an integer "count" between 1 and ${MAX_COMPETITION_COUNT}`);
        }
        if (promptBytes(instructions) > MAX_PROMPT_BYTES) {
            return sendErrorResponse(response, 413, PROMPT_TOO_LARGE_MESSAGE);
        }
        const labels = parseLabelsParameter(bodyLabels);
        const guidance = typeof instructions === 'string' ? instructions : '';

        let matches;
        try {
            ({ matches } = await readRankingsAsync(cwd));
        } catch (error) {
            return sendStoreError(response, error);
        }
        const titlesByName = await collectFolderTitlesAsync(cwd);
        const scoped = new Map();
        const scopedTitles = [];
        for (const [title, entry] of titlesByName) {
            if (!isInScope(entry, types, labels)) {
                continue;
            }
            scoped.set(title, entry);
            scopedTitles.push(title);
        }
        if (scoped.size < 2) {
            return sendErrorResponse(response, 400, 'Need at least two entries in scope to run competitions');
        }
        // The judge's prompt template (the competitionPrompt setting); empty means the built-in prompt. Read per run,
        // not at startup, so an edit in the Settings popover applies to the very next queued batch.
        const settings = await readSettingsAsync(cwd);
        const template = typeof settings.competitionPrompt === 'string' ? settings.competitionPrompt : '';
        // Pairing counts consider only the matches that currently replay (both contenders in scope), the same set
        // the standings use - orphaned history must not make a live pair look already-covered.
        const played = matches.filter(function (match) {
            return scoped.has(match.firstTitle) && scoped.has(match.secondTitle);
        });

        return streamClaudeRoute(request, response, async function ({ signal, onLine }) {
            for (let index = 0; index < count; index += 1) {
                const [firstTitle, secondTitle] = selectLeastMetPairings(scopedTitles, played, 1)[0];
                const first = { title: firstTitle, ...scoped.get(firstTitle) };
                const second = { title: secondTitle, ...scoped.get(secondTitle) };
                onLine(JSON.stringify({
                    type: 'competition_start',
                    index: index + 1,
                    count,
                    firstTitle,
                    secondTitle,
                    prompt: buildCompetitionPrompt({ first, second, instructions: guidance, template })
                }));
                const verdict = await judgeCompetitionAsync({ cwd, first, second, instructions: guidance, template, signal });
                const record = createMatch({ firstTitle, secondTitle, winnerTitle: verdict.winner, judge: 'AI', rationale: verdict.rationale });
                await addMatchesAsync(cwd, [record]);
                played.push(record);
                onLine(JSON.stringify({ type: 'competition_result', index: index + 1, count, match: record }));
            }
        });
    });

    // Discards match results by id - one, several, or the whole log - and answers with the recomputed picture, so
    // the client never has to guess what the standings look like after a discard.
    router.delete('/rankings/matches', async function (request, response) {
        const { ids, types: bodyTypes, labels: bodyLabels } = request.body || {};
        const types = parseTypesParameter(bodyTypes);
        if (types === null) {
            return sendErrorResponse(response, 400, 'Unknown entry type in "types"');
        }
        if (!Array.isArray(ids) || ids.some(function (id) { return typeof id !== 'string'; })) {
            return sendErrorResponse(response, 400, 'Expected an "ids" array of match ids');
        }
        const labels = parseLabelsParameter(bodyLabels);
        try {
            const { removed } = await removeMatchesAsync(cwd, ids);
            return sendSuccessResponse(response, { removed, ...await buildRankingsPayloadAsync(cwd, types, labels) });
        } catch (error) {
            return sendStoreError(response, error);
        }
    });

    return router;
};

export { createRankingsRouter };
