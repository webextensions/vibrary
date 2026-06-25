import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Router } from 'express';

import { ENTRY_TYPES } from '../../frontend/src/runbooksXmlCore.js';
import { isRunbooksNameIgnored, isValidRunbooksName, listRunbooksFiles } from '../utils/runbooksFiles.js';
import { applyTruthAsync } from '../utils/runClaudeApply.js';
import { applyTruthsAsync } from '../utils/runClaudeApplyBatch.js';
import { generateTruthsAsync } from '../utils/runClaudeGenerate.js';
import { generateTitleAsync } from '../utils/runClaudeTitle.js';
import { sendErrorResponse, sendSuccessResponse } from '../utils/sendResponse.js';

// Upper bound on truths generated in one request, guarding against a runaway agent run.
const MAX_GENERATE_COUNT = 50;

const createFilesRouter = function ({ cwd }) {
    const router = Router();

    router.get('/files', async function (request, response) {
        try {
            const files = await listRunbooksFiles(cwd);
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

    // Create a new, empty truths file from the explorer view. The name lives in the body (not the path) so it can be a
    // nested name like "docs/truths-foo.xml"; the parent directory is created if missing. The 'wx' write flag makes this
    // create-only, so adding a file never silently overwrites an existing one.
    router.post('/files', async function (request, response) {
        const { name } = request.body || {};
        if (!isValidRunbooksName(name)) {
            return sendErrorResponse(response, 400, 'Invalid file name');
        }
        const target = resolveWithinCwd(name);
        if (target === null) {
            return sendErrorResponse(response, 400, 'Invalid file name');
        }
        if (await isRunbooksNameIgnored(cwd, name)) {
            return sendErrorResponse(response, 400, 'File name is ignored by .runbooksignore');
        }

        try {
            await mkdir(path.dirname(target), { recursive: true });
            await writeFile(target, '', { encoding: 'utf8', flag: 'wx' });
            return sendSuccessResponse(response, { name });
        } catch (error) {
            if (error.code === 'EEXIST') {
                return sendErrorResponse(response, 409, 'File already exists');
            }
            return sendErrorResponse(response, 500, 'Unable to create file');
        }
    });

    router.get('/files/:name', async function (request, response) {
        const { name } = request.params;
        if (!isValidRunbooksName(name)) {
            return sendErrorResponse(response, 400, 'Invalid file name');
        }
        const target = resolveWithinCwd(name);
        if (target === null) {
            return sendErrorResponse(response, 400, 'Invalid file name');
        }
        if (await isRunbooksNameIgnored(cwd, name)) {
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
        if (!isValidRunbooksName(name)) {
            return sendErrorResponse(response, 400, 'Invalid file name');
        }
        const target = resolveWithinCwd(name);
        if (target === null) {
            return sendErrorResponse(response, 400, 'Invalid file name');
        }
        if (await isRunbooksNameIgnored(cwd, name)) {
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

    // Delete a truths file from the explorer view's "More" menu. The frontend confirms with the user first; folders have
    // no on-disk entity (they are derived from file paths), so the frontend deletes a folder by deleting each file in it.
    router.delete('/files/:name', async function (request, response) {
        const { name } = request.params;
        if (!isValidRunbooksName(name)) {
            return sendErrorResponse(response, 400, 'Invalid file name');
        }
        const target = resolveWithinCwd(name);
        if (target === null) {
            return sendErrorResponse(response, 400, 'Invalid file name');
        }
        if (await isRunbooksNameIgnored(cwd, name)) {
            return sendErrorResponse(response, 404, 'File not found');
        }

        try {
            await unlink(target);
            return sendSuccessResponse(response, { name });
        } catch (error) {
            if (error.code === 'ENOENT') {
                return sendErrorResponse(response, 404, 'File not found');
            }
            return sendErrorResponse(response, 500, 'Unable to delete file');
        }
    });

    // Run a headless "claude -p" agent that reads the codebase and existing entries, then appends new ones to the file.
    router.post('/files/:name/generate', async function (request, response) {
        const { name } = request.params;
        if (!isValidRunbooksName(name)) {
            return sendErrorResponse(response, 400, 'Invalid file name');
        }
        const target = resolveWithinCwd(name);
        if (target === null) {
            return sendErrorResponse(response, 400, 'Invalid file name');
        }
        if (await isRunbooksNameIgnored(cwd, name)) {
            return sendErrorResponse(response, 404, 'File not found');
        }

        const { type, count } = request.body || {};
        if (!ENTRY_TYPES.includes(type)) {
            return sendErrorResponse(response, 400, `Expected "type" to be one of: ${ENTRY_TYPES.join(', ')}`);
        }
        if (!Number.isSafeInteger(count) || count < 1 || count > MAX_GENERATE_COUNT) {
            return sendErrorResponse(response, 400, `Expected an integer "count" between 1 and ${MAX_GENERATE_COUNT}`);
        }

        try {
            const claudeOutput = await generateTruthsAsync({ cwd, name, type, count });
            return sendSuccessResponse(response, { name, claudeOutput });
        } catch (error) {
            return sendErrorResponse(response, 500, error.message);
        }
    });

    // Run a headless "claude -p" agent that makes the codebase conform to a single truth. Not file-name scoped: applying
    // acts on the whole project (cwd), so the truth's text is sent in the body rather than read back from a file.
    router.post('/apply', async function (request, response) {
        const { title, content, notes, instructions } = request.body || {};
        if (typeof title !== 'string' || typeof content !== 'string' || content.trim() === '') {
            return sendErrorResponse(response, 400, 'Expected string "title" and a non-empty "content"');
        }

        try {
            const claudeOutput = await applyTruthAsync({
                cwd,
                title,
                content,
                notes: typeof notes === 'string' ? notes : '',
                instructions: typeof instructions === 'string' ? instructions : ''
            });
            return sendSuccessResponse(response, { claudeOutput });
        } catch (error) {
            return sendErrorResponse(response, 500, error.message);
        }
    });

    // Run a headless "claude -p" agent that makes the codebase conform to several selected truths in a single run.
    // Like /apply, project-scoped: the entries' text is sent in the body and acted on against the whole project (cwd).
    router.post('/apply-batch', async function (request, response) {
        const { entries } = request.body || {};
        if (!Array.isArray(entries) || entries.length === 0) {
            return sendErrorResponse(response, 400, 'Expected a non-empty "entries" array');
        }
        const valid = entries.every(function (entry) {
            return entry !== null && typeof entry === 'object' &&
            typeof entry.title === 'string' && typeof entry.content === 'string' && entry.content.trim() !== '';
        });
        if (!valid) {
            return sendErrorResponse(response, 400, 'Each entry needs a string "title" and a non-empty "content"');
        }

        try {
            const claudeOutput = await applyTruthsAsync({
                cwd,
                entries: entries.map(function (entry) {
                    return {
                        title: entry.title,
                        content: entry.content,
                        notes: typeof entry.notes === 'string' ? entry.notes : ''
                    };
                })
            });
            return sendSuccessResponse(response, { claudeOutput });
        } catch (error) {
            return sendErrorResponse(response, 500, error.message);
        }
    });

    // Run a headless "claude -p" agent that derives a hyphenated title from a truth's content, backing the editor's
    // "Populate" button. Not file-name scoped: the content is sent in the body, and only the derived title is returned.
    router.post('/title', async function (request, response) {
        const { content } = request.body || {};
        if (typeof content !== 'string' || content.trim() === '') {
            return sendErrorResponse(response, 400, 'Expected a non-empty "content" field');
        }

        try {
            const title = await generateTitleAsync({ cwd, content });
            return sendSuccessResponse(response, { title });
        } catch (error) {
            return sendErrorResponse(response, 500, error.message);
        }
    });

    return router;
};

export { createFilesRouter };
