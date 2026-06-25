import { spawn } from 'node:child_process';

// Give the headless agent room to read the codebase and edit files; reject rather than hang forever if it stalls.
const APPLY_TIMEOUT_MS = 10 * 60 * 1000;

// The instruction handed to "claude -p". It makes the codebase conform to every selected truth in a single run, editing
// files on disk as needed. Each entry becomes a labeled block (Title / Content / optional Notes); the Notes line is
// omitted when an entry has none.
const buildPrompt = function (entries) {
    const lines = [
        'Apply the following truths to this project\'s codebase. Read them, then make any code changes needed so the',
        'project conforms to all of them. Edit files directly.',
        ''
    ];
    for (const [index, { title, content, notes }] of entries.entries()) {
        lines.push(`Truth ${index + 1}:`);
        lines.push(`Title: ${title}`);
        lines.push(`Content: ${content}`);
        if (notes !== '') {
            lines.push(`Notes: ${notes}`);
        }
        lines.push('');
    }
    return lines.join('\n');
};

// Run the headless agent to make `cwd` conform to all the given truths in one run. Resolves with the CLI's raw stdout on
// a clean exit (the caller forwards it to the browser console for debugging); rejects with a descriptive Error otherwise
// (missing CLI, non-zero exit, or timeout).
const applyTruthsAsync = function ({ cwd, entries }) {
    return new Promise(function (resolve, reject) {
        const child = spawn(
            'claude',
            ['-p', buildPrompt(entries), '--dangerously-skip-permissions'],
            { cwd, timeout: APPLY_TIMEOUT_MS }
        );

        let stdout = '';
        let stderr = '';
        child.stdout.on('data', function (chunk) {
            stdout += chunk.toString();
        });
        child.stderr.on('data', function (chunk) {
            stderr += chunk.toString();
        });

        child.on('error', function (error) {
            if (error.code === 'ENOENT') {
                reject(new Error('Claude CLI not found on PATH'));
                return;
            }
            reject(error);
        });

        child.on('close', function (code, signal) {
            if (signal === 'SIGTERM') {
                reject(new Error('Applying the truths timed out'));
                return;
            }
            if (code === 0) {
                resolve(stdout);
                return;
            }
            reject(new Error(stderr.trim() || `Claude exited with code ${code}`));
        });
    });
};

export { applyTruthsAsync };
