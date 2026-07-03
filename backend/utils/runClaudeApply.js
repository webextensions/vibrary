import { runStreamedAgentAsync } from './spawnClaude.js';

// Give the headless agent room to read the codebase and edit files; reject rather than hang forever if it stalls.
const APPLY_TIMEOUT_MS = 10 * 60 * 1000;

// The instruction handed to "claude -p". It makes the codebase conform to a single spec, editing files on disk as
// needed. The <notes> line is omitted when the spec has none. `instructions` carries optional custom one-time guidance
// the user supplied for this run; it is appended as an extra block only when non-empty.
const buildPrompt = function ({ title, content, notes, instructions }) {
    const lines = [
        'Apply the following spec to this project\'s codebase. Read it, then make any code changes needed so the',
        'project conforms to it. Edit files directly.',
        '',
        `Title: ${title}`,
        `Content: ${content}`
    ];
    if (notes !== '') {
        lines.push(`Notes: ${notes}`);
    }
    if (instructions !== '') {
        lines.push('', 'Additional one-time instructions for this run:', instructions);
    }
    return lines.join('\n');
};

// Run the headless agent to make `cwd` conform to the given spec, streaming its activity line by line through `onLine`
// (claude's stream-json events). Resolves on a clean exit; rejects with a descriptive Error otherwise (missing CLI,
// non-zero exit, timeout, or abort).
const applySpecAsync = function ({ cwd, title, content, notes, instructions, signal, onLine }) {
    return runStreamedAgentAsync({
        cwd,
        prompt: buildPrompt({ title, content, notes, instructions }),
        timeoutMs: APPLY_TIMEOUT_MS,
        timeoutMessage: 'Applying the spec timed out',
        signal,
        onLine
    });
};

export { applySpecAsync };
