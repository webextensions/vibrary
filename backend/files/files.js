import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Router } from 'express';
import writeFileAtomic from 'write-file-atomic';

import { countApprovedSpecs, parseVibraryXml, serializeVibraryXml } from '../../shared/vibraryXmlCore.js';
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
            // First pass: parse each file's entries once, collecting its titles/tallies and the relatesTo references it
            // makes. A file that cannot be read or parsed reports null tallies (its badge renders as errored).
            const parsed = [];
            for (const name of files) {
                const target = resolveWithinCwd(cwd, name);
                if (target === null) {
                    continue;
                }
                try {
                    const entries = parseVibraryXml(await readFile(target, 'utf8'));
                    parsed.push({
                        name,
                        titles: entries.map(function (entry) { return entry.title; }).filter(function (title) { return title !== ''; }),
                        approved: countApprovedSpecs(entries),
                        total: entries.length,
                        // Per-entry source + targets, retained so the second pass can both count this file's dangling
                        // references AND build the folder-wide reverse map (which entry references each title).
                        references: entries.map(function (entry) { return { title: entry.title, relatesTo: entry.relatesTo }; })
                    });
                } catch {
                    parsed.push({ name, titles: [], approved: null, total: null, references: [] });
                }
            }
            // A relatesTo reference resolves by exact title across every file, so the set of known titles is folder-wide.
            // Second pass: count each file's dangling references (targets absent from that set) so the sidebar can flag
            // files with broken links; a file that failed to parse reports null (its references are unknown).
            const knownTitles = new Set(parsed.flatMap(function (entry) { return entry.titles; }));
            const summaries = parsed.map(function (file) {
                const relatesTo = file.references.flatMap(function (entry) { return entry.relatesTo; });
                return {
                    name: file.name,
                    titles: file.titles,
                    approved: file.approved,
                    total: file.total,
                    brokenReferences: file.approved === null ? null : relatesTo.filter(function (reference) { return !knownTitles.has(reference); }).length
                };
            });
            // Reverse-reference map: for each existing title, which entries (file + entry title) point AT it via
            // relatesTo. Keyed only on real titles (a dangling target is nobody's viewable entry, so it is never looked
            // up). References resolve by exact title folder-wide, matching how the editor renders the forward chips.
            // A null-prototype object so a title that collides with an Object.prototype key (e.g. "constructor", a
            // perfectly valid normalized title) is a plain data key, not the inherited method - `x ??= []` on a normal
            // {} would find that method truthy, skip the assignment, and then `.push` on a function throws.
            const backlinks = Object.create(null);
            for (const file of parsed) {
                for (const entry of file.references) {
                    // Skip an untitled source: with no title it cannot be shown as a chip label nor navigated to, so it
                    // would only render a blank, dead "Referenced by" entry. (Its relatesTo is still counted for the
                    // broken-reference tally above - that is about the reference, not who makes it.)
                    if (entry.title !== '') {
                        for (const target of entry.relatesTo) {
                            if (knownTitles.has(target)) {
                                (backlinks[target] ??= []).push({ file: file.name, title: entry.title });
                            }
                        }
                    }
                }
            }
            return sendSuccessResponse(response, { files: summaries, backlinks, hasVibraryInclude });
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
    // Read-only and never browsed or edited through the app; the name is tightly constrained to a
    // "<vibrary>.xml.schemas.json" basename. Include-gated by DIRECTORY, not by the sidecar's nominal parent name:
    // a formSchemaRef resolves against the referencing entry's directory, and nothing requires the sidecar's parent
    // vibrary file to exist (an included tasks-foo.xml may reference tasks.xml.schemas.json with no tasks.xml
    // anywhere) - so requiring the stripped name to be included would break legitimate references. Requiring at least
    // one INCLUDED vibrary file in the sidecar's directory matches how sidecars are actually consumed, while keeping
    // an excluded folder's schema contents (field names, enum values, descriptions) unreadable.
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
            const files = await listVibraryFiles(cwd);
            const directory = path.posix.dirname(name);
            const hasIncludedSibling = files.some(function (file) {
                return path.posix.dirname(file) === directory;
            });
            if (!hasIncludedSibling) {
                return sendErrorResponse(response, 404, 'File not found');
            }
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
            // Atomic replace (temp file + fsync + rename): a plain writeFile truncates in place, so a crash, disk-full,
            // or process kill mid-write would leave the user's file empty or truncated. The other write routes keep
            // plain writes on purpose - they are create-only ('wx', which the temp+rename pattern cannot express) and
            // never hold the only copy of existing data.
            await writeFileAtomic(target, content, { encoding: 'utf8' });
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

        // Refuse to overwrite an existing target - but NOT when that "target" is the source file itself seen under a
        // different name. On a case-insensitive filesystem a case-only rename (specs-foo.xml -> specs-Foo.xml) resolves
        // the new name to the SAME inode, so a bare existence check would 409 a legitimate case fix. Compare identities
        // (device + inode) and block only a target that is a genuinely different file; a missing target (the common
        // case, and every case-only rename on a case-sensitive FS) just lets the rename proceed.
        try {
            const [sourceStat, targetStat] = await Promise.all([stat(source), stat(target)]);
            if (sourceStat.dev !== targetStat.dev || sourceStat.ino !== targetStat.ino) {
                return sendErrorResponse(response, 409, 'A file with the new name already exists');
            }
        } catch {
            // Target (or source) does not resolve to an existing file - the rename can proceed and will 404 below if it
            // is the source that is missing.
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

    // Move one or more entries out of this file and into another vibrary file, both on disk. The target may already
    // exist (the entries are appended) or not (it is created), so the same dialog can split entries into a fresh file.
    // The target is written FIRST (with the moved entries) and only then is the source rewritten without them: if the
    // second write fails, the entries still exist - duplicated into the target, which is visible and fixable - rather
    // than being lost. The source's baseFileHash is the same lost-update guard the save route uses; the frontend
    // requires the source saved first, so the client's entry positions line up with the on-disk order.
    router.post('/files/:name/move-entries', async function (request, response) {
        const { name } = request.params;
        const { targetName, indexes, baseFileHash } = request.body || {};

        if (!isValidVibraryName(name) || !isValidVibraryName(targetName)) {
            return sendErrorResponse(response, 400, 'Invalid file name');
        }
        if (name === targetName) {
            return sendErrorResponse(response, 400, 'Source and target are the same file');
        }
        const source = resolveWithinCwd(cwd, name);
        const targetPath = resolveWithinCwd(cwd, targetName);
        if (source === null || targetPath === null) {
            return sendErrorResponse(response, 400, 'Invalid file name');
        }
        if (!(await isVibraryNameIncluded(cwd, name))) {
            return sendErrorResponse(response, 404, 'File not found');
        }
        // A separate, clearer message for the target: when the user types a new name in the dialog, "File not found" is
        // confusing (they are creating it, not looking for it) - the real problem is the name is outside .vibraryinclude.
        if (!(await isVibraryNameIncluded(cwd, targetName))) {
            return sendErrorResponse(response, 400, `"${targetName}" is not allowed by .vibraryinclude - use a name matching its patterns`);
        }
        // Reject a target that is the SAME on-disk file as the source under a different name - a case-only variant on a
        // case-insensitive filesystem passes the string check above. Moving an entry "into" its own file would, with the
        // target-written-first order, append the moved entries and then overwrite that with source-minus-them, losing
        // them. Compare identities (dev + inode), like the rename route; a missing file just falls through to the 404.
        try {
            const [sourceStat, targetStat] = await Promise.all([stat(source), stat(targetPath)]);
            if (sourceStat.dev === targetStat.dev && sourceStat.ino === targetStat.ino) {
                return sendErrorResponse(response, 400, 'Source and target are the same file');
            }
        } catch {
            // Source or target does not resolve to an existing file; the readFile below answers with the proper 404.
        }
        if (!Array.isArray(indexes) || indexes.length === 0 || indexes.some(function (index) { return !Number.isSafeInteger(index) || index < 0; })) {
            return sendErrorResponse(response, 400, 'Expected a non-empty "indexes" array of entry positions');
        }
        if (baseFileHash !== undefined && typeof baseFileHash !== 'string') {
            return sendErrorResponse(response, 400, 'Expected "baseFileHash" to be a string');
        }

        try {
            const sourceContent = await readFile(source, 'utf8');
            if (typeof baseFileHash === 'string' && hashFileContent(sourceContent) !== baseFileHash) {
                return sendErrorResponse(response, 409, 'File changed on disk since it was loaded');
            }
            const sourceEntries = parseVibraryXml(sourceContent);
            if (indexes.some(function (index) { return index >= sourceEntries.length; })) {
                return sendErrorResponse(response, 409, 'An entry position is out of range - reload and try again');
            }
            // The target is created when it does not exist yet (moving entries into a fresh file); otherwise the moved
            // entries are appended to what is already there. Only a missing target is tolerated here - any other read
            // failure propagates to the catch below.
            let targetContent = null;
            try {
                targetContent = await readFile(targetPath, 'utf8');
            } catch (readError) {
                if (readError.code !== 'ENOENT') {
                    throw readError;
                }
            }
            const isTargetNew = targetContent === null;
            const targetEntries = isTargetNew ? [] : parseVibraryXml(targetContent);

            const moveSet = new Set(indexes);
            const moved = sourceEntries.filter(function (_entry, index) { return moveSet.has(index); });
            const nextTargetContent = serializeVibraryXml([...targetEntries, ...moved]);
            const nextSourceContent = serializeVibraryXml(sourceEntries.filter(function (_entry, index) { return !moveSet.has(index); }));

            // Target first (see the route comment) so a mid-move failure duplicates rather than loses. A brand-new
            // target is created with the create-only flag ('wx'), so a file that appeared in the meantime is never
            // silently overwritten - that race surfaces as a 409 instead.
            if (isTargetNew) {
                await mkdir(path.dirname(targetPath), { recursive: true });
                await writeFile(targetPath, nextTargetContent, { encoding: 'utf8', flag: 'wx' });
            } else {
                await writeFileAtomic(targetPath, nextTargetContent, { encoding: 'utf8' });
            }
            await writeFileAtomic(source, nextSourceContent, { encoding: 'utf8' });

            return sendSuccessResponse(response, {
                movedCount: moved.length,
                createdTarget: isTargetNew,
                source: { name, fileHash: hashFileContent(nextSourceContent) },
                target: { name: targetName, fileHash: hashFileContent(nextTargetContent) }
            });
        } catch (error) {
            if (error.code === 'ENOENT') {
                return sendErrorResponse(response, 404, 'File not found');
            }
            if (error.code === 'EEXIST') {
                return sendErrorResponse(response, 409, 'A file with the target name was created in the meantime');
            }
            console.error(`Failed to move entries from ${name} to ${targetName}:`, error);
            return sendErrorResponse(response, 500, 'Unable to move entries');
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
