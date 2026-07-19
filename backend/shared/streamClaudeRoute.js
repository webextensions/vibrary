import { Buffer } from 'node:buffer';

import { abortOnDisconnect } from './abortOnDisconnect.js';
import { sendErrorResponse } from './sendResponse.js';
import { MAX_TRANSCRIPT_LINES, saveTranscriptAsync } from './transcriptStore.js';

// The assembled prompt is handed to claude as a SINGLE argv argument, and the OS caps one argument's byte length
// (Linux's MAX_ARG_STRLEN is 128 KiB). Oversized user text would otherwise fail the spawn with an opaque E2BIG only
// after a "run" appeared to start; the routes reject it up front with a clear 413 instead. Measured in UTF-8 bytes
// (the OS limit is bytes, not characters) and kept well under 128 KiB to leave room for the fixed prompt template
// wrapping the user's text.
const MAX_PROMPT_BYTES = 96 * 1024;

const PROMPT_TOO_LARGE_MESSAGE = `Content is too large to send to the agent (limit ${MAX_PROMPT_BYTES / 1024} KB)`;

// Total UTF-8 byte size of the user-supplied text that will land in the prompt; non-string parts count as zero, so
// callers can pass raw body fields before their own type coercion.
const promptBytes = function (...parts) {
    return parts.reduce(function (total, part) {
        return total + (typeof part === 'string' ? Buffer.byteLength(part, 'utf8') : 0);
    }, 0);
};

// The frontend's activity queue runs agent jobs strictly one at a time, but a frontend-only invariant is not a
// safety boundary: a second browser tab, a retried request, or a direct API caller could otherwise run concurrent
// agents editing the same working tree (and racing each other's git operations). One module-level flag is enough -
// the server serves exactly one folder - and it spans every router that streams agent runs (files' agents router,
// rankings' competitions), which is exactly why this helper lives in shared/ rather than inside one router. The
// buffered read-only helpers (/title, /git/generate-message) stay unguarded on purpose: the UI runs them alongside a
// queued job by design. (An object property rather than a bare module `let` so route handlers may mutate it - lint
// forbids assigning to a top-level binding from inside a function.)
const singleFlight = { isAgentRunActive: false };

// Stream a "claude -p" run to the client as newline-delimited JSON (claude's own stream-json lines, one per write),
// followed by a terminal {"type":"_exit",...} line carrying the process outcome. `runner({ signal, onLine })` runs
// the agent. Cache-Control: no-transform makes the compression middleware pass the body through unbuffered so lines
// reach the browser as they arrive. On an abort the client is already gone, so we just stop writing. Every route
// funnels through here AFTER its validation, so only requests that actually start a run contend for the one slot.
// When `cwd` is given, the run's whole line stream is also persisted as a transcript record under
// .vibrary/transcripts/ once it settles (any outcome - success, error, or abort: aborted history is still history),
// so finished runs survive a server restart.
const streamClaudeRoute = async function (request, response, runner, cwd = undefined) {
    if (singleFlight.isAgentRunActive) {
        return sendErrorResponse(response, 409, 'Another agent run is already in progress');
    }
    singleFlight.isAgentRunActive = true;
    const startedAt = new Date().toISOString();
    const lines = [];
    let isTruncated = false;
    let outcome = 'success';
    let failureMessage = null;
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
            // Recorded even when the response can no longer be written (the client aborted): what the agent did
            // before dying is exactly what the persisted transcript is for.
            if (lines.length < MAX_TRANSCRIPT_LINES) {
                lines.push(line);
            } else {
                isTruncated = true;
            }
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
            if (controller.signal.aborted) {
                outcome = 'aborted';
            } else {
                outcome = 'error';
                failureMessage = error.message;
                writeLine(JSON.stringify({ type: '_exit', code: 1, error: error.message }));
            }
        }
    } finally {
        singleFlight.isAgentRunActive = false;
        if (!response.writableEnded) {
            response.end();
        }
        if (cwd !== undefined) {
            // Fire-and-forget by design (the store logs its own failures): the response is already settled, and a
            // transcript-disk problem must never delay or fail the next queued run.
            void saveTranscriptAsync(cwd, {
                route: request.originalUrl,
                startedAt,
                endedAt: new Date().toISOString(),
                outcome,
                error: failureMessage,
                truncated: isTruncated,
                lines
            });
        }
    }
};

export { MAX_PROMPT_BYTES, PROMPT_TOO_LARGE_MESSAGE, promptBytes, streamClaudeRoute };
