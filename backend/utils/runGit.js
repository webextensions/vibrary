import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// A diff or a long status can run large; give git room rather than truncating its output mid-stream.
const MAX_BUFFER = 16 * 1024 * 1024;

// Run "git <args>" in `cwd` and resolve with its stdout. execFile (not a shell) means the arguments are passed verbatim,
// so a path that looks like a flag cannot be reinterpreted; callers still pass "--" before user paths as defense in
// depth. A non-zero exit rejects with git's own stderr so the UI can surface the real reason.
const runGit = async function (cwd, commandArguments) {
    try {
        const { stdout } = await execFileAsync('git', commandArguments, { cwd, maxBuffer: MAX_BUFFER });
        return stdout;
    } catch (error) {
        if (error.code === 'ENOENT') {
            throw new Error('git not found on PATH', { cause: error });
        }
        const message = (error.stderr || error.message || '').toString().trim();
        throw new Error(message || `git ${commandArguments[0]} failed`, { cause: error });
    }
};

// True when `cwd` sits inside a git working tree. Any failure (git missing, not a repo) reports false so callers can
// show an empty state rather than an error.
const isGitRepoAsync = async function (cwd) {
    try {
        const stdout = await runGit(cwd, ['rev-parse', '--is-inside-work-tree']);
        return stdout.trim() === 'true';
    } catch {
        return false;
    }
};

// Parse "git status --porcelain=v1 -z" into one entry per changed path. The -z format separates records with NUL and,
// for a rename or copy, follows the record with a second NUL-terminated token holding the original path. Each record is
// "XY <path>": X is the staged (index) state and Y the unstaged (worktree) state; "??" marks an untracked file.
const parseStatusZ = function (stdout) {
    const tokens = stdout.split('\0');
    const entries = [];
    let index = 0;
    while (index < tokens.length) {
        const token = tokens[index];
        if (token === '') {
            index += 1;
            continue;
        }
        const indexStatus = token[0];
        const worktreeStatus = token[1];
        const filePath = token.slice(3);
        let originalPath = null;
        // A rename/copy in either column carries its source path as the next token.
        if (indexStatus === 'R' || indexStatus === 'C' || worktreeStatus === 'R' || worktreeStatus === 'C') {
            index += 1;
            originalPath = tokens[index] ?? null;
        }
        const isUntracked = indexStatus === '?' && worktreeStatus === '?';
        entries.push({
            path: filePath,
            originalPath,
            indexStatus,
            worktreeStatus,
            untracked: isUntracked,
            // A real (non-"?") index letter means there is something staged; likewise for the worktree column.
            staged: !isUntracked && indexStatus !== ' ',
            unstaged: !isUntracked && worktreeStatus !== ' '
        });
        // Advance past this record (a rename/copy already consumed its extra source-path token above).
        index += 1;
    }
    return entries;
};

// Current branch plus the list of changed files. "branch --show-current" returns the branch name (empty on a detached
// HEAD) and, unlike "rev-parse HEAD", does not fail on a repo with no commits yet.
const statusAsync = async function (cwd) {
    const branch = (await runGit(cwd, ['branch', '--show-current'])).trim();
    const raw = await runGit(cwd, ['status', '--porcelain=v1', '-z']);
    return { branch, files: parseStatusZ(raw) };
};

// The staged diff ("--cached") or the unstaged working-tree diff. The staged diff backs the commit-message generation.
const diffAsync = function (cwd, { staged } = {}) {
    return runGit(cwd, staged ? ['diff', '--cached'] : ['diff']);
};

const stageAsync = function (cwd, paths) {
    return runGit(cwd, ['add', '--', ...paths]);
};

const unstageAsync = function (cwd, paths) {
    return runGit(cwd, ['restore', '--staged', '--', ...paths]);
};

// Commit the staged changes with a summary and, when present, an extended body as a second "-m" paragraph.
const commitAsync = function (cwd, { summary, body }) {
    const commitArguments = ['commit', '-m', summary];
    if (typeof body === 'string' && body.trim() !== '') {
        commitArguments.push('-m', body);
    }
    return runGit(cwd, commitArguments);
};

const pushAsync = function (cwd) {
    return runGit(cwd, ['push']);
};

export { commitAsync, diffAsync, isGitRepoAsync, pushAsync, stageAsync, statusAsync, unstageAsync };
