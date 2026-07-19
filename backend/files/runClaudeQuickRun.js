import { runStreamedAgentAsync } from '../shared/spawnClaude.js';

// A quick run sits between the buffered helpers and a full apply: free-form work that may read and edit the project,
// so it gets an apply-sized base budget without the per-entry scaling (there are no entries).
const QUICK_RUN_TIMEOUT_MS = 30 * 60 * 1000;

// The one agent action with NO prompt template around the user's text: the whole point of a quick run is "just say
// it" - a change too small to deserve a spec (research: single rigid workflows are the documented failure mode of
// spec-driven tooling). The text goes to the CLI verbatim; what the user typed is exactly what runs.
const runQuickAsync = function ({ cwd, prompt, signal, onLine }) {
    return runStreamedAgentAsync({
        cwd,
        prompt,
        timeoutMs: QUICK_RUN_TIMEOUT_MS,
        timeoutMessage: `The quick run timed out after ${Math.round(QUICK_RUN_TIMEOUT_MS / 60000)} minutes; the working tree may be partially updated - review it in Source Control`,
        signal,
        onLine
    });
};

export { runQuickAsync };
