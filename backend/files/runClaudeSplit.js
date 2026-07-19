import { normalizeTitle } from '../../shared/vibraryXmlCore.js';
import { runBufferedAgentAsync } from '../shared/spawnClaude.js';

// Splitting is a prompt-only reasoning task over text already in hand (no repo research), so it gets a quick
// buffered budget like the title helper, not a streamed run's.
const SPLIT_TIMEOUT_MS = 4 * 60 * 1000;

// How many parts a split may propose. Two is the smallest split; six is already pushing "this was several features
// wearing one title" - beyond that the model is probably shredding, not scoping.
const MIN_PARTS = 2;
const MAX_PARTS = 6;

// The instruction handed to "claude -p": break one oversized entry into a few focused ones, each independently
// runnable, answered as bare JSON so the editor can preview the parts mechanically.
const buildSplitPrompt = function ({ title, content, notes }) {
    const lines = [
        'Split the following oversized backlog entry into between 2 and 4 smaller, FOCUSED entries. Each part must',
        'stand alone as one reviewable unit of work (one agent run, one reviewable diff); together they should cover',
        'the original without inventing new scope.',
        '',
        `Title: ${title}`,
        `Content: ${content}`
    ];
    if (notes !== '') {
        lines.push(`Notes: ${notes}`);
    }
    lines.push(
        '',
        'Respond with ONLY one JSON array, no code fences, no other text, shaped as:',
        '[{"title": "<hyphenated-lowercase-title>", "content": "<the part\'s full content>", "notes": "<optional notes or empty>"}, ...]'
    );
    return lines.join('\n');
};

// Reduce the model's stdout to validated parts. Lenient about JSON wrapped in prose or fences (first "[" through the
// last "]") but strict about the shape: a part without a real title and content, or a count outside 2..6, rejects
// the whole split - inserting half-formed entries would hand the user a worse mess than the oversized original.
// Titles are normalized through the same rule every other title-producing path uses.
const parseSplitParts = function (output) {
    const start = output.indexOf('[');
    const end = output.lastIndexOf(']');
    if (start === -1 || end <= start) {
        throw new Error('The split did not answer with a JSON array');
    }
    let parsed;
    try {
        parsed = JSON.parse(output.slice(start, end + 1));
    } catch (error) {
        throw new Error(`The split answer was not valid JSON: ${error.message}`, { cause: error });
    }
    if (!Array.isArray(parsed) || parsed.length < MIN_PARTS || parsed.length > MAX_PARTS) {
        throw new Error(`Expected between ${MIN_PARTS} and ${MAX_PARTS} parts, got ${Array.isArray(parsed) ? parsed.length : 'no array'}`);
    }
    return parsed.map(function (part, index) {
        if (part === null || typeof part !== 'object') {
            throw new Error(`Part ${index + 1} is not an object`);
        }
        const title = normalizeTitle(typeof part.title === 'string' ? part.title : '');
        const content = typeof part.content === 'string' ? part.content.trim() : '';
        if (title === '' || content === '') {
            throw new Error(`Part ${index + 1} needs a title and content`);
        }
        return { title, content, notes: typeof part.notes === 'string' ? part.notes : '' };
    });
};

// Run the split and resolve with the validated parts; rejects with a descriptive Error (missing CLI, timeout, or an
// answer that failed validation).
const splitSpecAsync = async function ({ cwd, title, content, notes, signal }) {
    const stdout = await runBufferedAgentAsync({
        cwd,
        prompt: buildSplitPrompt({ title, content, notes }),
        timeoutMs: SPLIT_TIMEOUT_MS,
        timeoutMessage: 'Splitting the entry timed out',
        signal
    });
    return parseSplitParts(stdout);
};

export { buildSplitPrompt, parseSplitParts, splitSpecAsync };
