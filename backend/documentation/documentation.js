import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Router } from 'express';

import { sendErrorResponse, sendSuccessResponse } from '../shared/sendResponse.js';

// The shipped manual lives inside the INSTALLED package's docs/ directory, not the served folder - the user's project
// has no reason to contain vibrary's own manual. That is why, unlike every other file route, this one neither resolves
// against cwd nor consults .vibraryinclude - and exactly why it must stay a tight allowlist of known file names rather
// than accepting anything path-like.
const documentationDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs');

// The manual pages the Help dialog's Guide tab can request - the package ships only these (package.json's files list
// includes "docs/*.md", deliberately excluding the internal docs/specs tree).
const DOC_NAMES = new Set(['README.md', 'editor.md', 'vibrary-file-format.md']);

const createDocumentationRouter = function () {
    const router = Router();

    // One shipped manual page, as raw markdown for the client to render. 404 for anything outside the allowlist -
    // including path-shaped names, which therefore never reach the filesystem.
    router.get('/docs/:name', async function (request, response) {
        const { name } = request.params;
        if (!DOC_NAMES.has(name)) {
            return sendErrorResponse(response, 404, 'Unknown document');
        }
        try {
            return sendSuccessResponse(response, { content: await readFile(path.join(documentationDirectory, name), 'utf8') });
        } catch (error) {
            console.error(`Failed to read the shipped doc "${name}":`, error);
            return sendErrorResponse(response, 500, 'Failed to read the document');
        }
    });

    return router;
};

export { createDocumentationRouter };
