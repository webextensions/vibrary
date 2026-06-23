import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Router } from 'express';

import { sendErrorResponse, sendSuccessResponse } from '../utils/sendResponse.js';
import { isTruthsNameIgnored, isValidTruthsName, listTruthsFiles } from '../utils/truthsFiles.js';

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

    // The folder this server is serving, so the frontend can scope per-folder client state (e.g. which tabs were open).
    router.get('/workspace', function (request, response) {
        return sendSuccessResponse(response, { cwd: path.resolve(cwd) });
    });

    // Resolve a validated name against cwd and confirm it stays inside cwd. The name validation already blocks
    // traversal; this is a defense-in-depth guard before any filesystem access. Returns null when the name escapes.
    const resolveWithinCwd = function (name) {
        const root = path.resolve(cwd);
        const target = path.resolve(root, name);
        return target === root || target.startsWith(root + path.sep) ? target : null;
    };

    router.get('/files/:name', async function (request, response) {
        const { name } = request.params;
        if (!isValidTruthsName(name)) {
            return sendErrorResponse(response, 400, 'Invalid file name');
        }
        const target = resolveWithinCwd(name);
        if (target === null) {
            return sendErrorResponse(response, 400, 'Invalid file name');
        }
        if (await isTruthsNameIgnored(cwd, name)) {
            return sendErrorResponse(response, 404, 'File not found');
        }

        try {
            const content = await readFile(target, 'utf8');
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
        const target = resolveWithinCwd(name);
        if (target === null) {
            return sendErrorResponse(response, 400, 'Invalid file name');
        }
        if (await isTruthsNameIgnored(cwd, name)) {
            return sendErrorResponse(response, 404, 'File not found');
        }

        const { content } = request.body || {};
        if (typeof content !== 'string') {
            return sendErrorResponse(response, 400, 'Expected a string "content" field');
        }

        try {
            await writeFile(target, content, 'utf8');
            return sendSuccessResponse(response, { name });
        } catch {
            return sendErrorResponse(response, 500, 'Unable to save file');
        }
    });

    return router;
};

export { createFilesRouter };
