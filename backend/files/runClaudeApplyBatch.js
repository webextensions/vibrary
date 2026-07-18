import { runStreamedAgentAsync } from '../shared/spawnClaude.js';

// Give the headless agent room to read the codebase and edit files; reject rather than hang forever if it stalls.
// Each entry past the first buys extra room on the base budget (a batch of N is roughly N specs' worth of work in
// ONE run, so holding it to a 1-spec budget guaranteed timeouts that SIGTERM the agent mid-edit and leave the
// working tree half conformed). The overall ceiling keeps a wedged run from living for hours.
const APPLY_BASE_TIMEOUT_MS = 10 * 60 * 1000;
const APPLY_PER_ENTRY_TIMEOUT_MS = 2 * 60 * 1000;
const APPLY_MAX_TIMEOUT_MS = 60 * 60 * 1000;

// The instruction handed to "claude -p". It makes the codebase conform to every selected spec in a single run, editing
// files on disk as needed (a single-card Apply arrives as a batch of one, so the opening line goes singular then).
// Each entry becomes a labeled block (Title / Content / optional Notes); the Notes line is omitted when an entry has
// none. `instructions` carries optional custom one-time guidance for the whole batch; appended once, after every
// entry, when non-empty.
const buildPrompt = function (entries, instructions) {
    const lines = entries.length === 1 ?
        [
            'Apply the following spec to this project\'s codebase. Read it, then make any code changes needed so the',
            'project conforms to it. Edit files directly.',
            ''
        ] :
        [
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
    const timeoutMs = Math.min(APPLY_MAX_TIMEOUT_MS, APPLY_BASE_TIMEOUT_MS + (APPLY_PER_ENTRY_TIMEOUT_MS * entries.length));
    return runStreamedAgentAsync({
        cwd,
        prompt: buildPrompt(entries, instructions),
        timeoutMs,
        // Name the batch size and the consequence: a timeout kills the agent mid-edit, so some entries may already be
        // applied - the user's next stop should be Source Control, not a retry-and-hope.
        timeoutMessage: `Applying ${entries.length} spec${entries.length === 1 ? '' : 's'} timed out after ${Math.round(timeoutMs / 60000)} minutes; the working tree may be partially updated - review it in Source Control`,
        signal,
        onLine
    });
};

export { applySpecsAsync };
