import { access, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Router } from 'express';

import { countApprovedSpecs, ENTRY_TYPES, parseVibraryXml } from '../../shared/vibraryXmlCore.js';
import { abortOnDisconnect } from '../shared/abortOnDisconnect.js';
import { isValidSchemasName, isValidVibraryName, isVibraryNameIncluded, listVibraryFiles, vibraryIncludeExistsAsync } from './vibraryFiles.js';
import { resolveWithinCwd } from '../shared/resolveWithinCwd.js';
import { applySpecAsync } from './runClaudeApply.js';
import { applySpecsAsync } from './runClaudeApplyBatch.js';
import { generateSpecsAsync } from './runClaudeGenerate.js';
import { runChatAsync } from './runClaudeChat.js';
import { runTaskAsync } from './runClaudeRunTask.js';
import { generateTitleAsync } from './runClaudeTitle.js';
import { sendErrorResponse, sendSuccessResponse } from '../shared/sendResponse.js';

// Upper bound on specs generated in one request, guarding against a runaway agent run.
const MAX_GENERATE_COUNT = 50;
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

// A claude session id, as captured from the CLI's own stream-json init event (a UUID). Enforced before the value
// lands on the agent's argv as --resume's value: the process already runs with permission prompts disabled, and a
// value starting with "-" would sit exactly where an injected flag could be parser-quirked into existence - keeping
// foreign shapes off that argv is cheap insurance, and a garbage id gets a clean 400 naming the problem instead of an
// opaque CLI failure.
const SESSION_ID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Upper bound on entries applied in one batch run. Generous - its job is only to catch a pathological
// select-everything-in-a-huge-file request before the single-argv prompt hits OS limits (Linux caps one argument
// around 128 KiB) or the model's context; normal batches are far smaller.
const MAX_APPLY_BATCH_COUNT = 50;

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

    // Stream a "claude -p" run to the client as newline-delimited JSON (claude's own stream-json lines, one per write),
    // followed by a terminal {"type":"_exit",...} line carrying the process outcome. `runner({ signal, onLine })` runs
    // the agent. Cache-Control: no-transform makes the compression middleware pass the body through unbuffered so lines
    // reach the browser as they arrive. On an abort the client is already gone, so we just stop writing.
    const streamClaudeRoute = async function (request, response, runner) {
        const controller = abortOnDisconnect(request, response);
        response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
        response.setHeader('Cache-Control', 'no-transform');
        response.flushHeaders();
        const writeLine = function (line) {
            if (response.writableEnded) {
                return;
            }
            response.write(`${line}\n`);
            // Flush so each line reaches the browser immediately rather than sitting in the compression middleware's
            // buffer (no-transform disables gzip, but the wrapper still needs the explicit flush).
            response.flush?.();
        };
        try {
            await runner({ signal: controller.signal, onLine: writeLine });
            writeLine(JSON.stringify({ type: '_exit', code: 0, error: null }));
        } catch (error) {
            if (!controller.signal.aborted) {
                writeLine(JSON.stringify({ type: '_exit', code: 1, error: error.message }));
            }
        } finally {
            if (!response.writableEnded) {
                response.end();
            }
        }
    };

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
            return sendSuccessResponse(response, { name, content });
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

        const { content } = request.body || {};
        if (typeof content !== 'string') {
            return sendErrorResponse(response, 400, 'Expected a string "content" field');
        }

        try {
            await writeFile(target, content, 'utf8');
            return sendSuccessResponse(response, { name });
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

    // Run a headless "claude -p" agent that reads the codebase and existing entries, then appends new ones to the file.
    router.post('/files/:name/generate', async function (request, response) {
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

        const { type, count, instructions } = request.body || {};
        if (!ENTRY_TYPES.includes(type)) {
            return sendErrorResponse(response, 400, `Expected "type" to be one of: ${ENTRY_TYPES.join(', ')}`);
        }
        if (!Number.isSafeInteger(count) || count < 1 || count > MAX_GENERATE_COUNT) {
            return sendErrorResponse(response, 400, `Expected an integer "count" between 1 and ${MAX_GENERATE_COUNT}`);
        }

        return streamClaudeRoute(request, response, function ({ signal, onLine }) {
            return generateSpecsAsync({ cwd, name, type, count, instructions: typeof instructions === 'string' ? instructions : '', signal, onLine });
        });
    });

    // Run a headless "claude -p" agent that makes the codebase conform to a single spec. Not file-name scoped: applying
    // acts on the whole project (cwd), so the spec's text is sent in the body rather than read back from a file.
    router.post('/apply', function (request, response) {
        const { title, content, notes, instructions } = request.body || {};
        if (typeof title !== 'string' || typeof content !== 'string' || content.trim() === '') {
            return sendErrorResponse(response, 400, 'Expected string "title" and a non-empty "content"');
        }

        return streamClaudeRoute(request, response, function ({ signal, onLine }) {
            return applySpecAsync({
                cwd,
                title,
                content,
                notes: typeof notes === 'string' ? notes : '',
                instructions: typeof instructions === 'string' ? instructions : '',
                signal,
                onLine
            });
        });
    });

    // Run a headless "claude -p" agent that carries out a single task. Like /apply, not file-name scoped: running acts
    // on the whole project (cwd), so the task's text is sent in the body rather than read back from a file.
    router.post('/run-task', function (request, response) {
        const { title, content, notes, instructions, options } = request.body || {};
        if (typeof title !== 'string' || typeof content !== 'string' || content.trim() === '') {
            return sendErrorResponse(response, 400, 'Expected string "title" and a non-empty "content"');
        }

        return streamClaudeRoute(request, response, function ({ signal, onLine }) {
            return runTaskAsync({
                cwd,
                title,
                content,
                notes: typeof notes === 'string' ? notes : '',
                instructions: typeof instructions === 'string' ? instructions : '',
                options: typeof options === 'string' ? options : '',
                signal,
                onLine
            });
        });
    });

    // Continue a finished activity as a chat: resume its claude session with a follow-up message. Not file-name scoped;
    // the message and the session id captured from the original run's stream are sent in the body.
    router.post('/chat', function (request, response) {
        const { message, sessionId } = request.body || {};
        if (typeof message !== 'string' || message.trim() === '') {
            return sendErrorResponse(response, 400, 'Expected a non-empty "message"');
        }
        if (typeof sessionId !== 'string' || !SESSION_ID_REGEX.test(sessionId)) {
            return sendErrorResponse(response, 400, 'Expected "sessionId" to be a session UUID');
        }

        return streamClaudeRoute(request, response, function ({ signal, onLine }) {
            return runChatAsync({ cwd, message, sessionId, signal, onLine });
        });
    });

    // Run a headless "claude -p" agent that makes the codebase conform to several selected specs in a single run.
    // Like /apply, project-scoped: the entries' text is sent in the body and acted on against the whole project (cwd).
    router.post('/apply-batch', function (request, response) {
        const { entries, instructions } = request.body || {};
        if (!Array.isArray(entries) || entries.length === 0) {
            return sendErrorResponse(response, 400, 'Expected a non-empty "entries" array');
        }
        if (entries.length > MAX_APPLY_BATCH_COUNT) {
            return sendErrorResponse(response, 400, `Expected at most ${MAX_APPLY_BATCH_COUNT} entries per batch`);
        }
        const valid = entries.every(function (entry) {
            return entry !== null && typeof entry === 'object' &&
            typeof entry.title === 'string' && typeof entry.content === 'string' && entry.content.trim() !== '';
        });
        if (!valid) {
            return sendErrorResponse(response, 400, 'Each entry needs a string "title" and a non-empty "content"');
        }

        return streamClaudeRoute(request, response, function ({ signal, onLine }) {
            return applySpecsAsync({
                cwd,
                entries: entries.map(function (entry) {
                    return {
                        title: entry.title,
                        content: entry.content,
                        notes: typeof entry.notes === 'string' ? entry.notes : ''
                    };
                }),
                instructions: typeof instructions === 'string' ? instructions : '',
                signal,
                onLine
            });
        });
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
