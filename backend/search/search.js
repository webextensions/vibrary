import { Router } from 'express';

import { searchVibrary } from './searchVibrary.js';
import { sendErrorResponse, sendSuccessResponse } from '../shared/sendResponse.js';

// Bound request cost against a pathological or malicious caller: the response size is already capped downstream, but
// an enormous query string or file list would still drive a full substring scan of every included file. A real search
// needle and file selection are far smaller than these, so clamp both rather than reject - the UI never approaches
// them, and a clamped over-long query still searches its (already nonsensical) leading characters.
const MAX_QUERY_LENGTH = 200;
const MAX_FILES = 200;

const createSearchRouter = function ({ cwd }) {
    const router = Router();

    // Full-text search across the included vibrary files (the same set the Explorer lists). An empty query returns an
    // empty result set rather than an error, so the panel can clear its results without special-casing. An optional
    // comma-separated "files" param narrows the search to just those file names; "matchCase=1" / "wholeWord=1" tighten
    // the matching (anything else, including absence, keeps the default case-insensitive substring scan).
    router.get('/search', async function (request, response) {
        const query = (typeof request.query.q === 'string' ? request.query.q : '').slice(0, MAX_QUERY_LENGTH);
        const filesParameter = request.query.files;
        const files = (typeof filesParameter === 'string' && filesParameter !== '' ?
            filesParameter.split(',').filter(function (name) {
                return name !== '';
            }) :
            []).slice(0, MAX_FILES);
        const isCaseSensitive = request.query.matchCase === '1';
        const isWholeWord = request.query.wholeWord === '1';
        try {
            return sendSuccessResponse(response, await searchVibrary(cwd, query, { files, matchCase: isCaseSensitive, wholeWord: isWholeWord }));
        } catch (error) {
            console.error('Search failed:', error);
            return sendErrorResponse(response, 500, 'Search failed');
        }
    });

    return router;
};

export { createSearchRouter };
