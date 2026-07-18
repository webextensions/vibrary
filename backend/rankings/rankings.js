import { readFile } from 'node:fs/promises';

import { Router } from 'express';

import { ENTRY_TYPES, parseVibraryXml } from '../../shared/vibraryXmlCore.js';
import { listVibraryFiles } from '../files/vibraryFiles.js';
import { resolveWithinCwd } from '../shared/resolveWithinCwd.js';
import { sendErrorResponse, sendSuccessResponse } from '../shared/sendResponse.js';
import { replayMatches, selectLeastMetPairings } from './eloRankings.js';
import { addMatchesAsync, createMatch, readRankingsAsync, removeMatchesAsync } from './rankingsStore.js';

// How many head-to-head suggestions the payload carries for the compare UI. A small buffer (not just one) lets the
// client advance through a few pairs without a round trip after each vote; it re-fetches long before running out.
const SUGGESTED_PAIRING_COUNT = 8;

// Every entry title in the folder mapped to its type, first occurrence winning - the same folder-wide,
// first-in-listing-order resolution rule relatesTo references use, so the rankings agree with the editor about which
// entry a duplicated title means. Unreadable files are skipped exactly as the listing badges skip them.
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
                    titles.set(entry.title, entry.type);
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

// The full rankings picture in one payload: scoped standings, the entire match history (annotated, never filtered -
// discarding is the user's decision, not the server's), and suggested next pairings. Standings replay only the
// matches whose contenders BOTH currently resolve to in-scope entries: a match against a renamed or deleted entry
// (orphaned) or an out-of-scope one is kept on disk but sits out of the replay, so the board always reflects entries
// that actually exist right now, and repairing a title brings its history straight back.
const buildRankingsPayloadAsync = async function (cwd, types) {
    const [{ matches }, titlesByName] = await Promise.all([readRankingsAsync(cwd), collectFolderTitlesAsync(cwd)]);
    const scoped = new Set();
    for (const [title, type] of titlesByName) {
        if (types.includes(type)) {
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
    return { standings, matches: annotated, types, suggestedPairings };
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
        try {
            return sendSuccessResponse(response, await buildRankingsPayloadAsync(cwd, types));
        } catch (error) {
            return sendStoreError(response, error);
        }
    });

    // Records one manual result. The judge is always Human here - the AI judge writes through the competition run
    // route, not this one - so a client cannot forge an AI verdict. Both contenders must currently exist: a manual
    // result is an act of prioritizing the backlog as it stands, unlike historical records which may go orphaned.
    router.post('/rankings/matches', async function (request, response) {
        const { firstTitle, secondTitle, winnerTitle, rationale, types: bodyTypes } = request.body || {};
        const types = parseTypesParameter(bodyTypes);
        if (types === null) {
            return sendErrorResponse(response, 400, 'Unknown entry type in "types"');
        }
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
            return sendSuccessResponse(response, { match: record, ...await buildRankingsPayloadAsync(cwd, types) });
        } catch (error) {
            // createMatch built the record from client fields, so a validation message here ("names a winner that is
            // neither contender") describes the request, not the file on disk.
            return sendErrorResponse(response, 400, error.message);
        }
    });

    // Discards match results by id - one, several, or the whole log - and answers with the recomputed picture, so
    // the client never has to guess what the standings look like after a discard.
    router.delete('/rankings/matches', async function (request, response) {
        const { ids, types: bodyTypes } = request.body || {};
        const types = parseTypesParameter(bodyTypes);
        if (types === null) {
            return sendErrorResponse(response, 400, 'Unknown entry type in "types"');
        }
        if (!Array.isArray(ids) || ids.some(function (id) { return typeof id !== 'string'; })) {
            return sendErrorResponse(response, 400, 'Expected an "ids" array of match ids');
        }
        try {
            const { removed } = await removeMatchesAsync(cwd, ids);
            return sendSuccessResponse(response, { removed, ...await buildRankingsPayloadAsync(cwd, types) });
        } catch (error) {
            return sendStoreError(response, error);
        }
    });

    return router;
};

export { createRankingsRouter };
