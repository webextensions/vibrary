import { Router } from 'express';

import { MAX_GENERATE_COUNT } from '../../shared/apiLimits.js';
import { ENTRY_TYPES } from '../../shared/vibraryXmlCore.js';
import { isValidVibraryName, isVibraryNameIncluded } from './vibraryFiles.js';
import { resolveWithinCwd } from '../shared/resolveWithinCwd.js';
import { applySpecsAsync } from './runClaudeApplyBatch.js';
import { collectFolderLabelsAsync } from './folderLabels.js';
import { generateSpecsAsync } from './runClaudeGenerate.js';
import { runChatAsync } from './runClaudeChat.js';
import { runTaskAsync } from './runClaudeRunTask.js';
import { sendErrorResponse } from '../shared/sendResponse.js';
import { MAX_PROMPT_BYTES, PROMPT_TOO_LARGE_MESSAGE, promptBytes, streamClaudeRoute } from '../shared/streamClaudeRoute.js';

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

const createAgentsRouter = function ({ cwd }) {
    const router = Router();

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
        if (promptBytes(instructions) > MAX_PROMPT_BYTES) {
            return sendErrorResponse(response, 413, PROMPT_TOO_LARGE_MESSAGE);
        }

        // Gathered before the run claims the single-flight slot: a folder that fails to parse just yields fewer
        // suggestions, never a failed generate.
        const existingLabels = await collectFolderLabelsAsync(cwd);

        return streamClaudeRoute(request, response, function ({ signal, onLine }) {
            return generateSpecsAsync({ cwd, name, type, count, instructions: typeof instructions === 'string' ? instructions : '', existingLabels, signal, onLine });
        });
    });

    // Run a headless "claude -p" agent that carries out a single task. Like /apply-batch, not file-name scoped:
    // running acts on the whole project (cwd), so the task's text is sent in the body rather than read back from a file.
    router.post('/run-task', function (request, response) {
        const { title, content, notes, instructions, options, useRalphLoop } = request.body || {};
        if (typeof title !== 'string' || typeof content !== 'string' || content.trim() === '') {
            return sendErrorResponse(response, 400, 'Expected string "title" and a non-empty "content"');
        }
        if (promptBytes(title, content, notes, instructions, options) > MAX_PROMPT_BYTES) {
            return sendErrorResponse(response, 413, PROMPT_TOO_LARGE_MESSAGE);
        }

        return streamClaudeRoute(request, response, function ({ signal, onLine }) {
            return runTaskAsync({
                cwd,
                title,
                content,
                notes: typeof notes === 'string' ? notes : '',
                instructions: typeof instructions === 'string' ? instructions : '',
                options: typeof options === 'string' ? options : '',
                // The structured Ralph-loop opt-in (the frontend derives it from the options form's `useRalphLoop`
                // property key); anything but an explicit true stays off.
                isRalphLoopEnabled: useRalphLoop === true,
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
        if (promptBytes(message) > MAX_PROMPT_BYTES) {
            return sendErrorResponse(response, 413, PROMPT_TOO_LARGE_MESSAGE);
        }

        return streamClaudeRoute(request, response, function ({ signal, onLine }) {
            return runChatAsync({ cwd, message, sessionId, signal, onLine });
        });
    });

    // Run a headless "claude -p" agent that makes the codebase conform to the selected specs in a single run - the
    // frontend's single-card Apply is a batch of one. Project-scoped: the entries' text is sent in the body and acted
    // on against the whole project (cwd).
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
        // The whole batch becomes one prompt, so the argv limit applies to the entries' combined text, not each entry.
        const batchBytes = entries.reduce(function (total, entry) {
            return total + promptBytes(entry.title, entry.content, entry.notes);
        }, promptBytes(instructions));
        if (batchBytes > MAX_PROMPT_BYTES) {
            return sendErrorResponse(response, 413, PROMPT_TOO_LARGE_MESSAGE);
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

    return router;
};

export { createAgentsRouter };
