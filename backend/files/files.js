import { createHash } from 'node:crypto';
import { access, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Router } from 'express';

import { countApprovedSpecs, parseVibraryXml } from '../../shared/vibraryXmlCore.js';
import { abortOnDisconnect } from '../shared/abortOnDisconnect.js';
import { isValidSchemasName, isValidVibraryName, isVibraryNameIncluded, listVibraryFiles, vibraryIncludeExistsAsync } from './vibraryFiles.js';
import { resolveWithinCwd } from '../shared/resolveWithinCwd.js';
import { generateTitleAsync } from './runClaudeTitle.js';
import { sendErrorResponse, sendSuccessResponse } from '../shared/sendResponse.js';

// The starter .vibraryinclude the empty state's one-click bootstrap writes: gitignore-style patterns (a pattern
// without a slash matches at every depth, so these cover nested folders too), showing every vibrary family. Users
// narrow it by editing the file; "!" re-excludes.
const VIBRARY_INCLUDE_TEMPLATE = [
    '# Which vibrary files the app shows and edits, as gitignore-style patterns ("!" re-excludes a match).',
    'ideas*.xml',
    'reviews*.xml',
    'specs*.xml',
    'tasks*.xml',
    ''
].join('\n');

// Opaque version token for one file's raw on-disk content, handed out by GET and echoed back by PUT so a save can
// detect that the file changed underneath the editor (an agent run, another tab, an outside tool). Only the two
// sides of that handshake ever compare these, so the algorithm is free to change.
const hashFileContent = function (content) {
    return createHash('sha1').update(content).digest('hex');
};

const createFilesRouter = function ({ cwd }) {
    const router = Router();

    router.get('/files', async function (request, response) {
        try {
            const [files, hasVibraryInclude] = await Promise.all([listVibraryFiles(cwd), vibraryIncludeExistsAsync(cwd)]);
            return sendSuccessResponse(response, { files, hasVibraryInclude });
        } catch (error) {
            console.error('Failed to list vibrary files:', error);
            return sendErrorResponse(response, 500, 'Unable to list files');
        }
    });

    // One-request workspace summary backing the sidebar badges and the "Relates to" title options: for every included
    // file, its entry titles plus approved/total tallies, computed here in a single pass - previously the frontend
    // re-downloaded every file's FULL content twice after each change (once for the title index, once per file for
    // two integers). Files are processed in listing order so downstream title dedup is deterministic. A file that
    // cannot be read or parsed reports null tallies (its badge renders as errored) without failing the summary.
    router.get('/files-summary', async function (request, response) {
        try {
            const [files, hasVibraryInclude] = await Promise.all([listVibraryFiles(cwd), vibraryIncludeExistsAsync(cwd)]);
            const summaries = [];
            for (const name of files) {
                const target = resolveWithinCwd(cwd, name);
                if (target === null) {
                    continue;
                }
                try {
                    const entries = parseVibraryXml(await readFile(target, 'utf8'));
                    summaries.push({
                        name,
                        titles: entries.map(function (entry) { return entry.title; }).filter(function (title) { return title !== ''; }),
                        approved: countApprovedSpecs(entries),
                        total: entries.length
                    });
                } catch {
                    summaries.push({ name, titles: [], approved: null, total: null });
                }
            }
            return sendSuccessResponse(response, { files: summaries, hasVibraryInclude });
        } catch (error) {
            console.error('Failed to summarize vibrary files:', error);
            return sendErrorResponse(response, 500, 'Unable to summarize files');
        }
    });

    // Bootstrap for the explorer's empty state: without a .vibraryinclude NOTHING is included, so even the app's own
    // "+" button dead-ends with a 400 - this gives the first run a one-click way out. Create-only ('wx'), so it can
    // never clobber patterns the user already wrote.
    router.post('/vibrary-include', async function (request, response) {
        try {
            await writeFile(path.resolve(cwd, '.vibraryinclude'), VIBRARY_INCLUDE_TEMPLATE, { encoding: 'utf8', flag: 'wx' });
            return sendSuccessResponse(response, {});
        } catch (error) {
            if (error.code === 'EEXIST') {
                return sendErrorResponse(response, 409, 'A .vibraryinclude already exists');
            }
            console.error('Failed to create .vibraryinclude:', error);
            return sendErrorResponse(response, 500, 'Unable to create .vibraryinclude');
        }
    });

    // The folder this server is serving, so the frontend can scope per-folder client state (e.g. which tabs were open).
    router.get('/workspace', function (request, response) {
        return sendSuccessResponse(response, { cwd: path.resolve(cwd) });
    });

    // Create a new, empty specs file from the explorer view. The name lives in the body (not the path) so it can be a
    // nested name like "docs/specs-foo.xml"; the parent directory is created if missing. The 'wx' write flag makes this
    // create-only, so adding a file never silently overwrites an existing one.
    router.post('/files', async function (request, response) {
        const { name } = request.body || {};
        if (!isValidVibraryName(name)) {
            return sendErrorResponse(response, 400, 'Invalid file name');
        }
        const target = resolveWithinCwd(cwd, name);
        if (target === null) {
            return sendErrorResponse(response, 400, 'Invalid file name');
        }
        if (!(await isVibraryNameIncluded(cwd, name))) {
            return sendErrorResponse(response, 400, 'File name is not included by .vibraryinclude');
        }

        try {
            await mkdir(path.dirname(target), { recursive: true });
            await writeFile(target, '', { encoding: 'utf8', flag: 'wx' });
            return sendSuccessResponse(response, { name });
        } catch (error) {
            if (error.code === 'EEXIST') {
                return sendErrorResponse(response, 409, 'File already exists');
            }
            console.error(`Failed to create ${name}:`, error);
            return sendErrorResponse(response, 500, 'Unable to create file');
        }
    });

    router.get('/files/:name', async function (request, response) {
        const { name } = request.params;
        if (!isValidVibraryName(name)) {
            return sendErrorResponse(response, 400, 'Invalid file name');
        }
        const target = resolveWithinCwd(cwd, name);
        if (target === null) {
            return sendErrorResponse(response, 400, 'Invalid file name');
        }
        if (!(await isVibraryNameIncluded(cwd, name))) {
            return sendErrorResponse(response, 404, 'File not found');
        }

        try {
            const content = await readFile(target, 'utf8');
            return sendSuccessResponse(response, { name, content, fileHash: hashFileContent(content) });
        } catch (error) {
            if (error.code === 'ENOENT') {
                return sendErrorResponse(response, 404, 'File not found');
            }
            console.error(`Failed to read ${name}:`, error);
            return sendErrorResponse(response, 500, 'Unable to read file');
        }
    });

    // Read a form-schemas sidecar (e.g. "docs/tasks/tasks.xml.schemas.json") that an entry's <formSchemaRef> points at.
    // Read-only and deliberately outside the listing/.vibraryinclude surface: the sidecar is resolved on demand, never
    // browsed or edited through the app. The name is tightly constrained to a "<vibrary>.xml.schemas.json" basename.
    router.get('/schema-file/:name', async function (request, response) {
        const { name } = request.params;
        if (!isValidSchemasName(name)) {
            return sendErrorResponse(response, 400, 'Invalid file name');
        }
        const target = resolveWithinCwd(cwd, name);
        if (target === null) {
            return sendErrorResponse(response, 400, 'Invalid file name');
        }

        try {
            const content = await readFile(target, 'utf8');
            return sendSuccessResponse(response, { name, content });
        } catch (error) {
            if (error.code === 'ENOENT') {
                return sendErrorResponse(response, 404, 'File not found');
            }
            console.error(`Failed to read schema file ${name}:`, error);
            return sendErrorResponse(response, 500, 'Unable to read file');
        }
    });

    router.put('/files/:name', async function (request, response) {
        const { name } = request.params;
        if (!isValidVibraryName(name)) {
            return sendErrorResponse(response, 400, 'Invalid file name');
        }
        const target = resolveWithinCwd(cwd, name);
        if (target === null) {
            return sendErrorResponse(response, 400, 'Invalid file name');
        }
        if (!(await isVibraryNameIncluded(cwd, name))) {
            return sendErrorResponse(response, 404, 'File not found');
        }

        const { content, baseFileHash } = request.body || {};
        if (typeof content !== 'string') {
            return sendErrorResponse(response, 400, 'Expected a string "content" field');
        }
        if (baseFileHash !== undefined && typeof baseFileHash !== 'string') {
            return sendErrorResponse(response, 400, 'Expected "baseFileHash" to be a string');
        }

        // Lost-update guard: when the client says which version it loaded (baseFileHash from GET), refuse to save over
        // a file that changed on disk in the meantime - agent runs edit the very files the editor has open, and a blind
        // write here would silently discard their work (or the user's, from another tab). A PUT without the field keeps
        // the old semantics; the 409 lets the UI offer reload-or-overwrite. The read-then-write window that remains is
        // the same single-user-local-server trade-off the rename route documents.
        if (typeof baseFileHash === 'string') {
            try {
                const currentContent = await readFile(target, 'utf8');
                if (hashFileContent(currentContent) !== baseFileHash) {
                    return sendErrorResponse(response, 409, 'File changed on disk since it was loaded');
                }
            } catch (error) {
                if (error.code === 'ENOENT') {
                    return sendErrorResponse(response, 409, 'File was deleted on disk since it was loaded');
                }
                console.error(`Failed to read ${name} before saving:`, error);
                return sendErrorResponse(response, 500, 'Unable to save file');
            }
        }

        try {
            await writeFile(target, content, 'utf8');
            return sendSuccessResponse(response, { name, fileHash: hashFileContent(content) });
        } catch (error) {
            console.error(`Failed to save ${name}:`, error);
            if (['EACCES', 'EROFS', 'EPERM'].includes(error.code)) {
                return sendErrorResponse(response, 500, 'Unable to save file: permission denied');
            }
            if (error.code === 'ENOSPC') {
                return sendErrorResponse(response, 500, 'Unable to save file: no space left on device');
            }
            return sendErrorResponse(response, 500, 'Unable to save file');
        }
    });

    // Rename (or move - the new name may live in another folder) a vibrary file. Both names must satisfy the naming
    // convention and the include rules, so a rename can never take a file outside the app's editable surface. Refuses
    // to overwrite: fs.rename would silently replace an existing target, so its absence is checked first (the small
    // check-then-rename race is acceptable for a single-user local server).
    router.post('/files/:name/rename', async function (request, response) {
        const { name } = request.params;
        const { newName } = request.body || {};
        if (!isValidVibraryName(name)) {
            return sendErrorResponse(response, 400, 'Invalid file name');
        }
        if (!isValidVibraryName(newName)) {
            return sendErrorResponse(response, 400, 'Invalid new file name');
        }
        const source = resolveWithinCwd(cwd, name);
        const target = resolveWithinCwd(cwd, newName);
        if (source === null || target === null) {
            return sendErrorResponse(response, 400, 'Invalid file name');
        }
        if (!(await isVibraryNameIncluded(cwd, name))) {
            return sendErrorResponse(response, 404, 'File not found');
        }
        if (!(await isVibraryNameIncluded(cwd, newName))) {
            return sendErrorResponse(response, 400, 'New file name is not included by .vibraryinclude');
        }

        try {
            await access(target);
            return sendErrorResponse(response, 409, 'A file with the new name already exists');
        } catch {
            // Target does not exist - good, the rename can proceed.
        }

        try {
            await mkdir(path.dirname(target), { recursive: true });
            await rename(source, target);
            return sendSuccessResponse(response, { name: newName });
        } catch (error) {
            if (error.code === 'ENOENT') {
                return sendErrorResponse(response, 404, 'File not found');
            }
            console.error(`Failed to rename ${name} to ${newName}:`, error);
            return sendErrorResponse(response, 500, 'Unable to rename file');
        }
    });

    // Duplicate a vibrary file: copy the source's on-disk content to a new name, leaving the source untouched. Both
    // names must satisfy the naming convention and the include rules, mirroring rename. Refuses to overwrite, like
    // rename: the target's absence is checked via the create-only 'wx' write flag.
    router.post('/files/:name/duplicate', async function (request, response) {
        const { name } = request.params;
        const { newName } = request.body || {};
        if (!isValidVibraryName(name)) {
            return sendErrorResponse(response, 400, 'Invalid file name');
        }
        if (!isValidVibraryName(newName)) {
            return sendErrorResponse(response, 400, 'Invalid new file name');
        }
        const source = resolveWithinCwd(cwd, name);
        const target = resolveWithinCwd(cwd, newName);
        if (source === null || target === null) {
            return sendErrorResponse(response, 400, 'Invalid file name');
        }
        if (!(await isVibraryNameIncluded(cwd, name))) {
            return sendErrorResponse(response, 404, 'File not found');
        }
        if (!(await isVibraryNameIncluded(cwd, newName))) {
            return sendErrorResponse(response, 400, 'New file name is not included by .vibraryinclude');
        }

        try {
            const content = await readFile(source, 'utf8');
            await mkdir(path.dirname(target), { recursive: true });
            await writeFile(target, content, { encoding: 'utf8', flag: 'wx' });
            return sendSuccessResponse(response, { name: newName });
        } catch (error) {
            if (error.code === 'ENOENT') {
                return sendErrorResponse(response, 404, 'File not found');
            }
            if (error.code === 'EEXIST') {
                return sendErrorResponse(response, 409, 'A file with the new name already exists');
            }
            console.error(`Failed to duplicate ${name} to ${newName}:`, error);
            return sendErrorResponse(response, 500, 'Unable to duplicate file');
        }
    });

    // Delete a specs file from the explorer view's "More" menu. The frontend confirms with the user first; folders have
    // no on-disk entity (they are derived from file paths), so the frontend deletes a folder by deleting each file in it.
    router.delete('/files/:name', async function (request, response) {
        const { name } = request.params;
        if (!isValidVibraryName(name)) {
            return sendErrorResponse(response, 400, 'Invalid file name');
        }
        const target = resolveWithinCwd(cwd, name);
        if (target === null) {
            return sendErrorResponse(response, 400, 'Invalid file name');
        }
        if (!(await isVibraryNameIncluded(cwd, name))) {
            return sendErrorResponse(response, 404, 'File not found');
        }

        try {
            await unlink(target);
            return sendSuccessResponse(response, { name });
        } catch (error) {
            if (error.code === 'ENOENT') {
                return sendErrorResponse(response, 404, 'File not found');
            }
            console.error(`Failed to delete ${name}:`, error);
            return sendErrorResponse(response, 500, 'Unable to delete file');
        }
    });

    // Run a headless "claude -p" agent that derives a hyphenated title from a spec's content, backing the editor's
    // "Populate" button. Not file-name scoped: the content is sent in the body, and only the derived title is returned.
    router.post('/title', async function (request, response) {
        const { content } = request.body || {};
        if (typeof content !== 'string' || content.trim() === '') {
            return sendErrorResponse(response, 400, 'Expected a non-empty "content" field');
        }

        const controller = abortOnDisconnect(request, response);
        try {
            const title = await generateTitleAsync({ cwd, content, signal: controller.signal });
            return sendSuccessResponse(response, { title });
        } catch (error) {
            if (controller.signal.aborted) {
                return undefined;
            }
            return sendErrorResponse(response, 500, error.message);
        }
    });

    return router;
};

export { createFilesRouter };
