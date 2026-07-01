import path from 'node:path';

import { Router } from 'express';

import { generateCommitMessageAsync } from '../utils/runClaudeCommitMessage.js';
import { commitAsync, diffAsync, discardAsync, isGitRepoAsync, pullAsync, pushAsync, removeUntrackedAsync, stageAsync, stashApplyAsync, stashDropAsync, stashListAsync, stashPopAsync, stashSaveAsync, statusAsync, unstageAsync } from '../utils/runGit.js';
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

    // Pull can change the working tree, so answer with the refreshed status (like stage/unstage) rather than pull's
    // own summary - the panel re-renders from it in one round trip.
    router.post('/git/pull', async function (request, response) {
        try {
            if (!(await requireRepo(response))) {
                return undefined;
            }
            await pullAsync(cwd);
            return sendSuccessResponse(response, await statusAsync(cwd));
        } catch (error) {
            return sendErrorResponse(response, 500, error.message);
        }
    });

    // Discard working-tree changes for the given paths: tracked files are restored from the index/HEAD, untracked
    // files are deleted. Splitting by the current status here (rather than trusting the client's grouping) keeps the
    // destructive branch - deletion - tied to what git itself reports as untracked.
    router.post('/git/discard', async function (request, response) {
        const paths = validatePaths((request.body || {}).paths);
        if (paths === null) {
            return sendErrorResponse(response, 400, 'Expected a non-empty "paths" array');
        }
        try {
            if (!(await requireRepo(response))) {
                return undefined;
            }
            const status = await statusAsync(cwd);
            const untrackedPaths = new Set(status.files.filter(function (file) {
                return file.index === '?' && file.working_dir === '?';
            }).map(function (file) {
                return file.path;
            }));
            const untracked = paths.filter(function (entry) {
                return untrackedPaths.has(entry);
            });
            const tracked = paths.filter(function (entry) {
                return !untrackedPaths.has(entry);
            });
            if (tracked.length > 0) {
                await discardAsync(cwd, tracked);
            }
            if (untracked.length > 0) {
                await removeUntrackedAsync(cwd, untracked);
            }
            return sendSuccessResponse(response, await statusAsync(cwd));
        } catch (error) {
            return sendErrorResponse(response, 500, error.message);
        }
    });

    router.get('/git/stashes', async function (request, response) {
        try {
            if (!(await requireRepo(response))) {
                return undefined;
            }
            return sendSuccessResponse(response, await stashListAsync(cwd));
        } catch (error) {
            return sendErrorResponse(response, 500, error.message);
        }
    });

    // Stash the current changes (staged + unstaged + untracked) under an optional message. Answers with both the
    // refreshed status and the refreshed stash list, since the action changes both.
    router.post('/git/stash', async function (request, response) {
        const { message } = request.body || {};
        if (message !== undefined && typeof message !== 'string') {
            return sendErrorResponse(response, 400, 'Expected "message" to be a string');
        }
        try {
            if (!(await requireRepo(response))) {
                return undefined;
            }
            await stashSaveAsync(cwd, message);
            return sendSuccessResponse(response, { status: await statusAsync(cwd), stashes: await stashListAsync(cwd) });
        } catch (error) {
            return sendErrorResponse(response, 500, error.message);
        }
    });

    // Apply / pop / drop a stash by its stash@{N} position. All three take { index } and answer with the refreshed
    // status + stash list, since each changes at least one of the two.
    const stashActions = { apply: stashApplyAsync, pop: stashPopAsync, drop: stashDropAsync };
    for (const [action, runAction] of Object.entries(stashActions)) {
        router.post(`/git/stash/${action}`, async function (request, response) {
            const { index } = request.body || {};
            if (!Number.isSafeInteger(index) || index < 0) {
                return sendErrorResponse(response, 400, 'Expected "index" to be a non-negative integer');
            }
            try {
                if (!(await requireRepo(response))) {
                    return undefined;
                }
                await runAction(cwd, index);
                return sendSuccessResponse(response, { status: await statusAsync(cwd), stashes: await stashListAsync(cwd) });
            } catch (error) {
                return sendErrorResponse(response, 500, error.message);
            }
        });
    }

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
