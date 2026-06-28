import { Router } from 'express';

import { searchVibrary } from '../utils/searchVibrary.js';
import { sendErrorResponse, sendSuccessResponse } from '../utils/sendResponse.js';

const createSearchRouter = function ({ cwd }) {
    const router = Router();

    // Full-text search across the included vibrary files (the same set the Explorer lists). An empty query returns an
    // empty result set rather than an error, so the panel can clear its results without special-casing.
    router.get('/search', async function (request, response) {
        const query = typeof request.query.q === 'string' ? request.query.q : '';
        try {
            return sendSuccessResponse(response, await searchVibrary(cwd, query));
        } catch {
            return sendErrorResponse(response, 500, 'Search failed');
        }
    });

    return router;
};

export { createSearchRouter };
