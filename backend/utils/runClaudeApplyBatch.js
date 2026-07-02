import { CLAUDE_STREAM_FLAGS, emitUserPrompt, spawnClaudeStreamAsync } from './spawnClaude.js';

// Give the headless agent room to read the codebase and edit files; reject rather than hang forever if it stalls.
const APPLY_TIMEOUT_MS = 10 * 60 * 1000;

// The instruction handed to "claude -p". It makes the codebase conform to every selected spec in a single run, editing
// files on disk as needed. Each entry becomes a labeled block (Title / Content / optional Notes); the Notes line is
// omitted when an entry has none. `instructions` carries optional custom one-time guidance for the whole batch (the
// bulk counterpart of the single-spec /apply route's own `instructions`); appended once, after every entry, when
// non-empty.
const buildPrompt = function (entries, instructions) {
    const lines = [
        'Apply the following specs to this project\'s codebase. Read them, then make any code changes needed so the',
        'project conforms to all of them. Edit files directly.',
        ''
    ];
    for (const [index, { title, content, notes }] of entries.entries()) {
        lines.push(`Spec ${index + 1}:`);
        lines.push(`Title: ${title}`);
        lines.push(`Content: ${content}`);
        if (notes !== '') {
            lines.push(`Notes: ${notes}`);
        }
        lines.push('');
    }
    if (instructions !== '') {
        lines.push('Additional one-time instructions for this run:', instructions);
    }
    return lines.join('\n');
};

// Run the headless agent to make `cwd` conform to all the given specs in one run, streaming its activity line by line
// through `onLine` (claude's stream-json events). Resolves on a clean exit; rejects with a descriptive Error otherwise
// (missing CLI, non-zero exit, timeout, or abort).
const applySpecsAsync = function ({ cwd, entries, instructions, signal, onLine }) {
    const prompt = buildPrompt(entries, instructions);
    emitUserPrompt(onLine, prompt);
    return spawnClaudeStreamAsync({
        cwd,
        args: ['-p', prompt, ...CLAUDE_STREAM_FLAGS, '--dangerously-skip-permissions'],
        timeoutMs: APPLY_TIMEOUT_MS,
        timeoutMessage: 'Applying the specs timed out',
        signal,
        onLine
    });
};

export { applySpecsAsync };
