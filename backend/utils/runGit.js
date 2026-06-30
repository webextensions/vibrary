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

// The staged diff ("--cached") or the unstaged working-tree diff. The staged diff backs the commit-message generation.
const diffAsync = function (cwd, { staged } = {}) {
    return gitFor(cwd).diff(staged ? ['--cached'] : []);
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

const pushAsync = function (cwd) {
    return gitFor(cwd).push();
};

export { commitAsync, diffAsync, isGitRepoAsync, pushAsync, stageAsync, statusAsync, unstageAsync };
