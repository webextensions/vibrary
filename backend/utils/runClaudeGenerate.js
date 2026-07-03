import { runStreamedAgentAsync } from '../shared/spawnClaude.js';

// Give the headless agent room to read the codebase and write the file; reject rather than hang forever if it stalls.
const GENERATE_TIMEOUT_MS = 10 * 60 * 1000;

// The instruction handed to "claude -p". It edits the target file on disk directly; <contentHash> is left empty because
// the editor recomputes it from <content> on load (see vibraryXmlCore.parseVibraryXml). `instructions` carries optional
// custom one-time guidance the user supplied for this run (the same field every other run/apply route accepts);
// appended as an extra block only when non-empty.
const buildPrompt = function (name, type, count, instructions) {
    const lines = [
        `Add exactly ${count} new <entry type="${type}"> elements to the file "${name}" in this project.`,
        '',
        // Conditional on purpose: the format doc ships with vibrary's own repo, not with the folders the server is
        // typically started in - pointing the agent at a file that does not exist there wastes a turn.
        'If docs/vibrary-file-format.md exists in this folder, read it to learn the XML format (when it does not, the',
        `rules below cover the essentials). Then read the existing entries in ${name} and explore the project's`,
        'codebase to find accurate, non-obvious facts about it worth capturing.',
        '',
        'Rules:',
        `- Append ${count} new <entry type="${type}"> elements inside the <entries> wrapper. If the file is empty,`,
        '  create the <root><entries>...</entries></root> structure. Do not modify or delete existing entries.',
        `- A file may hold a mix of entry types; set every new entry's type attribute to "${type}" regardless of what`,
        '  other entries in the file use.',
        '- Each new entry must be distinct from the existing entries and from each other.',
        '- Each <entry> has these child elements in this order: <title>, <createdBy>, <approved>, <content>,',
        '  <contentHash>, <relatesTo>, <notes>, <labels>, <created>, <updated>, <updatedBy>.',
        '- Set <createdBy>AI</createdBy> and <updatedBy>AI</updatedBy>. Leave <approved></approved> and',
        '  <contentHash></contentHash> empty (the editor recomputes the hash on load).',
        '- Set <created> and <updated> to the current UTC time in ISO 8601 (for example 2026-06-24T12:00:00.000Z).',
        '- Use a hyphenated lowercase <title>. Add relevant <label> entries under <labels>, and add <ref> entries under',
        '  <relatesTo> pointing to existing entry titles where they genuinely relate.',
        '- Keep the file valid XML, matching the existing structure and four-space indentation.',
        '',
        `Edit ${name} directly.`
    ];
    if (instructions !== '') {
        lines.push('', 'Additional one-time instructions for this run:', instructions);
    }
    return lines.join('\n');
};

// Run the headless agent to append `count` entries of `type` to `name` within `cwd`, streaming its activity line by
// line through `onLine` (claude's stream-json events). Resolves on a clean exit; rejects with a descriptive Error
// otherwise (missing CLI, non-zero exit, timeout, or abort).
const generateSpecsAsync = function ({ cwd, name, type, count, instructions, signal, onLine }) {
    return runStreamedAgentAsync({
        cwd,
        prompt: buildPrompt(name, type, count, instructions),
        timeoutMs: GENERATE_TIMEOUT_MS,
        timeoutMessage: 'Spec generation timed out',
        signal,
        onLine
    });
};

export { generateSpecsAsync };
