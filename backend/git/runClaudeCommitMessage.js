import { spawnClaudeAsync } from '../shared/spawnClaude.js';

// Drafting a commit message from a diff is a quick, read-free task; cap it well under the apply/generate budget so a
// stall fails fast. Mirrors the title call's short ceiling.
const COMMIT_MESSAGE_TIMEOUT_MS = 2 * 60 * 1000;

// The instruction handed to "claude -p". It turns a staged diff into a conventional commit message: a one-line summary,
// a blank line, then a body. Output is the message only, with no fences or preamble, so stdout parses cleanly.
const buildPrompt = function (diff) {
    return [
        'Write a git commit message for the following staged diff. Respond with the summary on the first line',
        '(imperative mood, roughly 70 characters or fewer, no trailing period), then a blank line, then a body that',
        'explains what changed and why - plain prose or "-" bullet points. Output ONLY the commit message: no preamble,',
        'no explanation, no surrounding quotes or code fences.',
        '',
        'Staged diff:',
        diff
    ].join('\n');
};

// Split the model's stdout into the summary (first non-empty line) and the body (everything after it). The blank line
// the prompt asks for is collapsed by the trims, so callers get a clean summary/body pair.
const parseMessage = function (stdout) {
    const trimmed = stdout.replaceAll('\r\n', '\n').trim();
    const newlineIndex = trimmed.indexOf('\n');
    if (newlineIndex === -1) {
        return { summary: trimmed, body: '' };
    }
    return {
        summary: trimmed.slice(0, newlineIndex).trim(),
        body: trimmed.slice(newlineIndex + 1).trim()
    };
};

// Run the headless agent to draft a commit message from a staged diff. Resolves with { summary, body } on a clean exit;
// rejects with a descriptive Error otherwise (missing CLI, non-zero exit, or timeout).
const generateCommitMessageAsync = async function ({ cwd, diff, signal }) {
    const stdout = await spawnClaudeAsync({
        cwd,
        args: ['-p', buildPrompt(diff)],
        timeoutMs: COMMIT_MESSAGE_TIMEOUT_MS,
        timeoutMessage: 'Generating the commit message timed out',
        signal
    });
    return parseMessage(stdout);
};

export { generateCommitMessageAsync, parseMessage };
