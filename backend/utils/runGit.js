import { simpleGit } from 'simple-git';

// A fresh simple-git instance bound to `cwd`. simple-git spawns git itself, buffers large output (diffs, status), and
// rejects with a GitError whose message carries git's stderr, so callers can surface the real reason.
const gitFor = function (cwd) {
    return simpleGit(cwd);
};

// True when `cwd` sits inside a git working tree. Any failure (git missing, not a repo) reports false so callers can
// show an empty state rather than an error.
const isGitRepoAsync = async function (cwd) {
    try {
        return await gitFor(cwd).checkIsRepo();
    } catch {
        return false;
    }
};

// Current branch plus the list of changed files, as simple-git's native StatusResult: `current` is the branch (null on
// a detached HEAD) and `files` holds one `{ path, index, working_dir }` per change (index = staged column, working_dir =
// worktree column; "??" marks an untracked file).
const statusAsync = function (cwd) {
    return gitFor(cwd).status();
};

// The staged diff ("--cached") or the unstaged working-tree diff, optionally narrowed to one path (the Status
// panel's per-file diff view). The whole-repo staged diff backs the commit-message generation. The "--" separates
// flags from paths so a path that looks like a flag cannot be reinterpreted.
/** @param {string} cwd @param {{ staged?: boolean, path?: string }} [options] */
const diffAsync = function (cwd, { staged, path } = {}) {
    const diffArguments = staged ? ['--cached'] : [];
    if (typeof path === 'string' && path !== '') {
        diffArguments.push('--', path);
    }
    return gitFor(cwd).diff(diffArguments);
};

const stageAsync = function (cwd, paths) {
    return gitFor(cwd).add(['--', ...paths]);
};

// simple-git has no dedicated `restore` method, so run it verbatim through `raw`. The "--" separates flags from paths so
// a path that looks like a flag cannot be reinterpreted.
const unstageAsync = function (cwd, paths) {
    return gitFor(cwd).raw(['restore', '--staged', '--', ...paths]);
};

// Commit the staged changes with a summary and, when present, an extended body as a second paragraph. simple-git turns
// each array entry into its own "-m".
const commitAsync = function (cwd, { summary, body }) {
    const messages = [summary];
    if (typeof body === 'string' && body.trim() !== '') {
        messages.push(body);
    }
    return gitFor(cwd).commit(messages);
};

// Push the current branch. A branch with no upstream would make a bare `git push` fail with "no upstream branch", so
// that case publishes the branch instead (push -u to the first remote), matching what a UI user expects Push to do.
const pushAsync = async function (cwd) {
    const git = gitFor(cwd);
    const status = await git.status();
    if (status.tracking === null && status.current !== null) {
        const remotes = await git.getRemotes();
        if (remotes.length === 0) {
            throw new Error('No remote is configured to push to');
        }
        // Via raw (like unstageAsync) because unicorn/no-return-array-push mistakes push-with-arguments for Array#push.
        return git.raw(['push', '--set-upstream', remotes[0].name, status.current]);
    }
    return git.push();
};

const pullAsync = function (cwd) {
    return gitFor(cwd).pull();
};

// Restore the given tracked paths' worktree content from the index/HEAD - the working-tree counterpart of unstage.
// Destructive for the caller's edits, so the UI confirms before calling this.
const discardAsync = function (cwd, paths) {
    return gitFor(cwd).raw(['restore', '--', ...paths]);
};

// Delete the given untracked paths. "Discard" on an untracked file means removing it, which `git restore` cannot do.
// "-f" is required because git refuses to clean without it (clean.requireForce defaults to true).
const removeUntrackedAsync = function (cwd, paths) {
    return gitFor(cwd).raw(['clean', '-f', '--', ...paths]);
};

// Stash everything the Status panel shows - staged, unstaged and untracked - under an optional message. Untracked
// files are included because the panel presents them as part of the working set, so "stash" hiding them matches what
// the user sees.
const stashSaveAsync = function (cwd, message) {
    const stashArguments = ['push', '--include-untracked'];
    if (typeof message === 'string' && message.trim() !== '') {
        stashArguments.push('-m', message.trim());
    }
    return gitFor(cwd).stash(stashArguments);
};

// The stash list as [{ index, message, date }], where `index` is the stash@{N} position used by apply/pop/drop.
const stashListAsync = async function (cwd) {
    const list = await gitFor(cwd).stashList();
    return list.all.map(function (entry, index) {
        return { index, message: entry.message, date: entry.date };
    });
};

// Apply / pop / drop by stash@{N} position. `index` is validated as a non-negative integer by the route before it is
// interpolated here.
const stashApplyAsync = function (cwd, index) {
    return gitFor(cwd).stash(['apply', `stash@{${index}}`]);
};

const stashPopAsync = function (cwd, index) {
    return gitFor(cwd).stash(['pop', `stash@{${index}}`]);
};

const stashDropAsync = function (cwd, index) {
    return gitFor(cwd).stash(['drop', `stash@{${index}}`]);
};

export { commitAsync, diffAsync, discardAsync, isGitRepoAsync, pullAsync, pushAsync, removeUntrackedAsync, stageAsync, stashApplyAsync, stashDropAsync, stashListAsync, stashPopAsync, stashSaveAsync, statusAsync, unstageAsync };
