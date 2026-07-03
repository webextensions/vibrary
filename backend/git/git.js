import { readFile } from 'node:fs/promises';

import { Router } from 'express';

import { abortOnDisconnect } from '../shared/abortOnDisconnect.js';
import { generateCommitMessageAsync } from './runClaudeCommitMessage.js';
import { resolveWithinCwd } from '../shared/resolveWithinCwd.js';
import { commitAsync, diffAsync, discardAsync, isGitRepoAsync, pullAsync, pushAsync, removeUntrackedAsync, stageAsync, stashApplyAsync, stashDropAsync, stashListAsync, stashPopAsync, stashSaveAsync, statusAsync, unstageAsync } from './runGit.js';
import { sendErrorResponse, sendSuccessResponse } from '../shared/sendResponse.js';

const createGitRouter = function ({ cwd }) {
    const router = Router();

    // Validate a request's { paths } array: a non-empty array of in-cwd strings. Returns the array on success, or null
    // so the route can answer 400 without touching git.
    const validatePaths = function (paths) {
        if (!Array.isArray(paths) || paths.length === 0) {
            return null;
        }
        for (const entry of paths) {
            if (typeof entry !== 'string' || entry === '' || resolveWithinCwd(cwd, entry) === null) {
                return null;
            }
        }
        return paths;
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

    // One file's diff for the Status panel's view-before-you-discard dialog: staged ("--cached") or worktree. An
    // untracked file has no diff, so its full content is returned instead (marked untracked) - the same "what would I
    // be deleting?" question, answered the only way an untracked file can be. The path guard scopes reads to the
    // served folder, the same trust boundary every other route enforces.
    router.get('/git/diff', async function (request, response) {
        const { path: diffPath, staged, untracked } = request.query;
        const target = typeof diffPath === 'string' && diffPath !== '' ? resolveWithinCwd(cwd, diffPath) : null;
        if (target === null) {
            return sendErrorResponse(response, 400, 'Expected an in-folder "path"');
        }
        try {
            if (!(await requireRepo(response))) {
                return undefined;
            }
            if (untracked === 'true') {
                const content = await readFile(target, 'utf8');
                return sendSuccessResponse(response, { diff: content, untracked: true });
            }
            const diff = await diffAsync(cwd, { staged: staged === 'true', path: diffPath });
            return sendSuccessResponse(response, { diff, untracked: false });
        } catch (error) {
            return sendErrorResponse(response, 500, error.message);
        }
    });

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

    // Push changes the sync state (ahead count, and publishing sets the upstream), so answer with the refreshed
    // status like commit/pull do - otherwise the panel keeps rendering the pre-push arrows until a manual refresh.
    router.post('/git/push', async function (request, response) {
        try {
            if (!(await requireRepo(response))) {
                return undefined;
            }
            await pushAsync(cwd);
            return sendSuccessResponse(response, await statusAsync(cwd));
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
