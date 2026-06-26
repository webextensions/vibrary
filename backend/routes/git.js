import path from 'node:path';

import { Router } from 'express';

import { generateCommitMessageAsync } from '../utils/runClaudeCommitMessage.js';
import { commitAsync, diffAsync, isGitRepoAsync, pushAsync, stageAsync, statusAsync, unstageAsync } from '../utils/runGit.js';
import { sendErrorResponse, sendSuccessResponse } from '../utils/sendResponse.js';

const createGitRouter = function ({ cwd }) {
    const router = Router();

    // Resolve a path against cwd and confirm it stays inside cwd, so a stage/unstage request can never touch a file
    // outside the served folder. Returns null when the path escapes. Mirrors the guard in the files router.
    const resolveWithinCwd = function (name) {
        const root = path.resolve(cwd);
        const target = path.resolve(root, name);
        return target === root || target.startsWith(root + path.sep) ? target : null;
    };

    // Validate a request's { paths } array: a non-empty array of in-cwd strings. Returns the array on success, or null
    // so the route can answer 400 without touching git.
    const validatePaths = function (paths) {
        if (!Array.isArray(paths) || paths.length === 0) {
            return null;
        }
        for (const entry of paths) {
            if (typeof entry !== 'string' || entry === '' || resolveWithinCwd(entry) === null) {
                return null;
            }
        }
        return paths;
    };

    // Wire a client disconnect to an AbortController so a long-running "claude -p" child (commit-message generation) is
    // killed when the browser aborts its fetch. Listens on the response, not the request, for the same reason the files
    // router does: Express drains the request body up front, so request 'close' fires too early.
    const abortOnDisconnect = function (request, response) {
        const controller = new AbortController();
        response.on('close', function () {
            if (!response.writableEnded) {
                controller.abort();
            }
        });
        return controller;
    };

    // Reject every git route up front when the folder is not a repository, so the panel can show a clear empty state
    // rather than a raw git error per endpoint.
    const requireRepo = async function (response) {
        if (await isGitRepoAsync(cwd)) {
            return true;
        }
        sendErrorResponse(response, 400, 'Not a git repository');
        return false;
    };

    router.get('/git/status', async function (request, response) {
        try {
            if (!(await requireRepo(response))) {
                return undefined;
            }
            return sendSuccessResponse(response, await statusAsync(cwd));
        } catch (error) {
            return sendErrorResponse(response, 500, error.message);
        }
    });

    router.post('/git/stage', async function (request, response) {
        const paths = validatePaths((request.body || {}).paths);
        if (paths === null) {
            return sendErrorResponse(response, 400, 'Expected a non-empty "paths" array');
        }
        try {
            if (!(await requireRepo(response))) {
                return undefined;
            }
            await stageAsync(cwd, paths);
            return sendSuccessResponse(response, await statusAsync(cwd));
        } catch (error) {
            return sendErrorResponse(response, 500, error.message);
        }
    });

    router.post('/git/unstage', async function (request, response) {
        const paths = validatePaths((request.body || {}).paths);
        if (paths === null) {
            return sendErrorResponse(response, 400, 'Expected a non-empty "paths" array');
        }
        try {
            if (!(await requireRepo(response))) {
                return undefined;
            }
            await unstageAsync(cwd, paths);
            return sendSuccessResponse(response, await statusAsync(cwd));
        } catch (error) {
            return sendErrorResponse(response, 500, error.message);
        }
    });

    router.post('/git/commit', async function (request, response) {
        const { summary, body } = request.body || {};
        if (typeof summary !== 'string' || summary.trim() === '') {
            return sendErrorResponse(response, 400, 'Expected a non-empty "summary" field');
        }
        if (body !== undefined && typeof body !== 'string') {
            return sendErrorResponse(response, 400, 'Expected "body" to be a string');
        }
        try {
            if (!(await requireRepo(response))) {
                return undefined;
            }
            await commitAsync(cwd, { summary: summary.trim(), body: typeof body === 'string' ? body : '' });
            return sendSuccessResponse(response, await statusAsync(cwd));
        } catch (error) {
            return sendErrorResponse(response, 500, error.message);
        }
    });

    router.post('/git/push', async function (request, response) {
        try {
            if (!(await requireRepo(response))) {
                return undefined;
            }
            const output = await pushAsync(cwd);
            return sendSuccessResponse(response, { output });
        } catch (error) {
            return sendErrorResponse(response, 500, error.message);
        }
    });

    // Draft a commit message from the staged diff via a headless "claude -p" run. Refuses when nothing is staged, since
    // there is no diff to summarize.
    router.post('/git/generate-message', async function (request, response) {
        if (!(await requireRepo(response))) {
            return undefined;
        }
        let diff;
        try {
            diff = await diffAsync(cwd, { staged: true });
        } catch (error) {
            return sendErrorResponse(response, 500, error.message);
        }
        if (diff.trim() === '') {
            return sendErrorResponse(response, 400, 'No staged changes to summarize');
        }
        const controller = abortOnDisconnect(request, response);
        try {
            const message = await generateCommitMessageAsync({ cwd, diff, signal: controller.signal });
            return sendSuccessResponse(response, message);
        } catch (error) {
            if (controller.signal.aborted) {
                return undefined;
            }
            return sendErrorResponse(response, 500, error.message);
        }
    });

    return router;
};

export { createGitRouter };
