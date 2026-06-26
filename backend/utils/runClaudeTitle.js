import { spawnClaudeAsync } from './spawnClaude.js';

// Deriving a short title is a quick, read-free task; cap it well under the apply/generate budget so a stall fails fast.
const TITLE_TIMEOUT_MS = 2 * 60 * 1000;

// The instruction handed to "claude -p". It turns freeform spec content into one concise hyphenated-lowercase title,
// emitted on its own with no surrounding prose so the raw stdout can be slugified straight into the title field.
const buildPrompt = function (content) {
    return [
        'Derive a concise, descriptive title for the following spec content. Respond with ONLY the title as a single',
        'line of lowercase words joined by hyphens (a-z, 0-9 and hyphens only), no quotes, no explanation, no trailing',
        'punctuation. Keep it under about ten words.',
        '',
        'Spec content:',
        content
    ].join('\n');
};

// Reduce the model's stdout to a safe hyphenated-title: take the first non-empty line, lowercase it, and collapse
// anything that is not a-z/0-9 into single hyphens. Mirrors the editor's own onBlur title normalization.
const slugify = function (output) {
    const firstLine = output.split('\n').map(function (line) {
        return line.trim();
    }).find(Boolean) || '';
    return firstLine
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, '-')
        .replaceAll(/^-+|-+$/g, '');
};

// Run the headless agent to derive a hyphenated title from spec content. Resolves with the slugified title on a clean
// exit; rejects with a descriptive Error otherwise (missing CLI, non-zero exit, or timeout).
const generateTitleAsync = async function ({ cwd, content, signal }) {
    const stdout = await spawnClaudeAsync({
        cwd,
        args: ['-p', buildPrompt(content)],
        timeoutMs: TITLE_TIMEOUT_MS,
        timeoutMessage: 'Deriving the title timed out',
        signal
    });
    return slugify(stdout);
};

export { generateTitleAsync };
