import { Buffer } from 'node:buffer';

import { Router } from 'express';

import { MAX_GENERATE_COUNT } from '../../shared/apiLimits.js';
import { ENTRY_TYPES } from '../../shared/vibraryXmlCore.js';
import { abortOnDisconnect } from '../shared/abortOnDisconnect.js';
import { isValidVibraryName, isVibraryNameIncluded } from './vibraryFiles.js';
import { resolveWithinCwd } from '../shared/resolveWithinCwd.js';
import { applySpecAsync } from './runClaudeApply.js';
import { applySpecsAsync } from './runClaudeApplyBatch.js';
import { generateSpecsAsync } from './runClaudeGenerate.js';
import { runChatAsync } from './runClaudeChat.js';
import { runTaskAsync } from './runClaudeRunTask.js';
import { sendErrorResponse } from '../shared/sendResponse.js';

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

// The assembled prompt is handed to claude as a SINGLE argv argument, and the OS caps one argument's byte length
// (Linux's MAX_ARG_STRLEN is 128 KiB). Oversized user text would otherwise fail the spawn with an opaque E2BIG only
// after a "run" appeared to start; the routes reject it up front with a clear 413 instead. Measured in UTF-8 bytes
// (the OS limit is bytes, not characters) and kept well under 128 KiB to leave room for the fixed prompt template
// wrapping the user's text.
const MAX_PROMPT_BYTES = 96 * 1024;

// Total UTF-8 byte size of the user-supplied text that will land in the prompt; non-string parts count as zero, so
// callers can pass raw body fields before their own type coercion.
const promptBytes = function (...parts) {
    return parts.reduce(function (total, part) {
        return total + (typeof part === 'string' ? Buffer.byteLength(part, 'utf8') : 0);
    }, 0);
};

const PROMPT_TOO_LARGE_MESSAGE = `Content is too large to send to the agent (limit ${MAX_PROMPT_BYTES / 1024} KB)`;

const createAgentsRouter = function ({ cwd }) {
    const router = Router();

    // The frontend's activity queue runs agent jobs strictly one at a time, but a frontend-only invariant is not a
    // safety boundary: a second browser tab, a retried request, or a direct API caller could otherwise run concurrent
    // agents editing the same working tree (and racing each other's git operations). One in-process flag is enough -
    // the server serves exactly one folder. The buffered read-only helpers (/title, /git/generate-message) stay
    // unguarded on purpose: the UI runs them alongside a queued job by design.
    let isAgentRunActive = false;

    // Stream a "claude -p" run to the client as newline-delimited JSON (claude's own stream-json lines, one per write),
    // followed by a terminal {"type":"_exit",...} line carrying the process outcome. `runner({ signal, onLine })` runs
    // the agent. Cache-Control: no-transform makes the compression middleware pass the body through unbuffered so lines
    // reach the browser as they arrive. On an abort the client is already gone, so we just stop writing. Every route
    // funnels through here AFTER its validation, so only requests that actually start a run contend for the one slot.
    const streamClaudeRoute = async function (request, response, runner) {
        if (isAgentRunActive) {
            return sendErrorResponse(response, 409, 'Another agent run is already in progress');
        }
        isAgentRunActive = true;
        // Everything after the flag is set lives inside this try so the finally ALWAYS releases the slot. The header
        // prologue (flushHeaders on a socket that just went away) can throw, and if that escaped before the try the
        // flag would stay stuck true and answer every future run 409 forever - a permanent denial of the app's core
        // feature until a restart.
        try {
            const controller = abortOnDisconnect(request, response);
            response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
            response.setHeader('Cache-Control', 'no-transform');
            response.flushHeaders();
            const writeLine = function (line) {
                if (response.writableEnded) {
                    return;
                }
                response.write(`${line}\n`);
                // Flush so each line reaches the browser immediately rather than sitting in the compression
                // middleware's buffer (no-transform disables gzip, but the wrapper still needs the explicit flush).
                response.flush?.();
            };
            try {
                await runner({ signal: controller.signal, onLine: writeLine });
                writeLine(JSON.stringify({ type: '_exit', code: 0, error: null }));
            } catch (error) {
                if (!controller.signal.aborted) {
                    writeLine(JSON.stringify({ type: '_exit', code: 1, error: error.message }));
                }
            }
        } finally {
            isAgentRunActive = false;
            if (!response.writableEnded) {
                response.end();
            }
        }
    };

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
        if (promptBytes(title, content, notes, instructions) > MAX_PROMPT_BYTES) {
            return sendErrorResponse(response, 413, PROMPT_TOO_LARGE_MESSAGE);
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
