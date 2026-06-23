import { spawn } from 'node:child_process';

// Give the headless agent room to read the codebase and edit files; reject rather than hang forever if it stalls.
const APPLY_TIMEOUT_MS = 10 * 60 * 1000;

// The instruction handed to "claude -p". It makes the codebase conform to a single truth, editing files on disk as
// needed. The <notes> line is omitted when the truth has none.
const buildPrompt = function ({ title, content, notes }) {
    const lines = [
        'Apply the following truth to this project\'s codebase. Read it, then make any code changes needed so the',
        'project conforms to it. Edit files directly.',
        '',
        `Title: ${title}`,
        `Content: ${content}`
    ];
    if (notes !== '') {
        lines.push(`Notes: ${notes}`);
    }
    return lines.join('\n');
};

// Run the headless agent to make `cwd` conform to the given truth. Resolves with the CLI's raw stdout on a clean exit
// (the caller forwards it to the browser console for debugging); rejects with a descriptive Error otherwise (missing
// CLI, non-zero exit, or timeout).
const applyTruthAsync = function ({ cwd, title, content, notes }) {
    return new Promise(function (resolve, reject) {
        const child = spawn(
            'claude',
            ['-p', buildPrompt({ title, content, notes }), '--dangerously-skip-permissions'],
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
                reject(new Error('Applying the truth timed out'));
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

export { applyTruthAsync };
