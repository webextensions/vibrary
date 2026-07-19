import { Router } from 'express';

import { sendErrorResponse, sendSuccessResponse } from '../shared/sendResponse.js';
import { clearTranscriptsAsync, deleteTranscriptAsync, listTranscriptsAsync, readTranscriptAsync } from '../shared/transcriptStore.js';

// The history browser over the persisted agent-run transcripts (written by streamClaudeRoute via transcriptStore).
// Names double as ids; the store's strict name-shape gate is what keeps path-shaped input off the filesystem, so
// these routes stay thin.
const createTranscriptsRouter = function ({ cwd }) {
    const router = Router();

    router.get('/transcripts', async function (request, response) {
        try {
            return sendSuccessResponse(response, { transcripts: await listTranscriptsAsync(cwd) });
        } catch (error) {
            console.error('Failed to list transcripts:', error);
            return sendErrorResponse(response, 500, 'Failed to list transcripts');
        }
    });

    router.get('/transcripts/:name', async function (request, response) {
        const record = await readTranscriptAsync(cwd, request.params.name);
        if (record === null) {
            return sendErrorResponse(response, 404, 'Transcript not found');
        }
        return sendSuccessResponse(response, { transcript: record });
    });

    router.delete('/transcripts/:name', async function (request, response) {
        const removed = await deleteTranscriptAsync(cwd, request.params.name);
        if (!removed) {
            return sendErrorResponse(response, 404, 'Transcript not found');
        }
        return sendSuccessResponse(response, {});
    });

    router.delete('/transcripts', async function (request, response) {
        try {
            await clearTranscriptsAsync(cwd);
            return sendSuccessResponse(response, {});
        } catch (error) {
            console.error('Failed to clear transcripts:', error);
            return sendErrorResponse(response, 500, 'Failed to clear transcripts');
        }
    });

    return router;
};

export { createTranscriptsRouter };
