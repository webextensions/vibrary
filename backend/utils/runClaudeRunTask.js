import { CLAUDE_STREAM_FLAGS, spawnClaudeStreamAsync } from './spawnClaude.js';

// Give the headless agent room to read the codebase and edit files; reject rather than hang forever if it stalls.
const RUN_TASK_TIMEOUT_MS = 10 * 60 * 1000;

// The instruction handed to "claude -p". It carries out a single task against the project, editing files on disk as
// needed. The <notes> line is omitted when the task has none. `options` carries the directive block derived from the
// task's per-run options form, and `instructions` carries optional custom one-time guidance the user supplied for this
// run; each is appended as an extra block only when non-empty. Options come first so explicit instructions still read
// as the final word.
const buildPrompt = function ({ title, content, notes, options, instructions }) {
    const lines = [
        'Carry out the following task for this project. Read it, then do the work it describes, editing files',
        'directly as needed.',
        '',
        `Title: ${title}`,
        `Content: ${content}`
    ];
    if (notes !== '') {
        lines.push(`Notes: ${notes}`);
    }
    if (options !== '') {
        lines.push('', 'Selected options for this run:', options);
    }
    if (instructions !== '') {
        lines.push('', 'Additional one-time instructions for this run:', instructions);
    }
    return lines.join('\n');
};

// Run the headless agent to carry out the given task against `cwd`, streaming its activity line by line through
// `onLine` (claude's stream-json events). Resolves on a clean exit; rejects with a descriptive Error otherwise (missing
// CLI, non-zero exit, timeout, or abort).
const runTaskAsync = function ({ cwd, title, content, notes, options, instructions, signal, onLine }) {
    return spawnClaudeStreamAsync({
        cwd,
        args: ['-p', buildPrompt({ title, content, notes, options, instructions }), ...CLAUDE_STREAM_FLAGS, '--dangerously-skip-permissions'],
        timeoutMs: RUN_TASK_TIMEOUT_MS,
        timeoutMessage: 'Running the task timed out',
        signal,
        onLine
    });
};

export { runTaskAsync };
