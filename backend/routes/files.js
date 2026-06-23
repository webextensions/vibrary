import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Router } from 'express';

import { sendErrorResponse, sendSuccessResponse } from '../utils/sendResponse.js';
import { isValidTruthsName, listTruthsFiles } from '../utils/truthsFiles.js';

const createFilesRouter = function ({ cwd }) {
    const router = Router();

    router.get('/files', async function (request, response) {
        try {
            const files = await listTruthsFiles(cwd);
            return sendSuccessResponse(response, { files });
        } catch {
            return sendErrorResponse(response, 500, 'Unable to list files');
        }
    });

    router.get('/files/:name', async function (request, response) {
        const { name } = request.params;
        if (!isValidTruthsName(name)) {
            return sendErrorResponse(response, 400, 'Invalid file name');
        }

        try {
            const content = await readFile(path.join(cwd, name), 'utf8');
            return sendSuccessResponse(response, { name, content });
        } catch (error) {
            if (error.code === 'ENOENT') {
                return sendErrorResponse(response, 404, 'File not found');
            }
            return sendErrorResponse(response, 500, 'Unable to read file');
        }
    });

    router.put('/files/:name', async function (request, response) {
        const { name } = request.params;
        if (!isValidTruthsName(name)) {
            return sendErrorResponse(response, 400, 'Invalid file name');
        }

        const { content } = request.body || {};
        if (typeof content !== 'string') {
            return sendErrorResponse(response, 400, 'Expected a string "content" field');
        }

        try {
            await writeFile(path.join(cwd, name), content, 'utf8');
            return sendSuccessResponse(response, { name });
        } catch {
            return sendErrorResponse(response, 500, 'Unable to save file');
        }
    });

    return router;
};

export { createFilesRouter };
