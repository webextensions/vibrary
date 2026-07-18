import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runStreamedAgentAsync } from '../shared/spawnClaude.js';

// The format doc inside the INSTALLED package (docs/*.md is in the files list; the smoke test guards its presence).
// The prompt points the agent at THIS copy, not at one in the served folder: the old "if docs/vibrary-file-format.md
// exists in this folder, read it" was true in vibrary's own repo and false for every npm-installed user - a
// works-on-my-machine gap where installed users' agents only ever saw the abbreviated inline rules.
const FORMAT_DOC_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'vibrary-file-format.md');

// Give the headless agent room to read the codebase and write the file; reject rather than hang forever if it stalls.
const GENERATE_TIMEOUT_MS = 10 * 60 * 1000;

// The instruction handed to "claude -p". It edits the target file on disk directly; <contentHash> is left empty because
// the editor recomputes it from <content> on load (see vibraryXmlCore.parseVibraryXml). `instructions` carries optional
// custom one-time guidance the user supplied for this run (the same field every other run/apply route accepts);
// appended as an extra block only when non-empty.
const buildPrompt = function (name, type, count, instructions, existingLabels) {
    const lines = [
        `Add exactly ${count} new <entry type="${type}"> elements to the file "${name}" in this project.`,
        '',
        `Read ${FORMAT_DOC_PATH} to learn the XML format (the rules below cover the essentials).`,
        `Then read the existing entries in ${name} and explore the project's`,
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
        '- Keep the file valid XML, matching the existing structure and four-space indentation.'
    ];
    // Show the agent the vocabulary the folder already uses: without it every run is free to coin new variants
    // ("auth" / "Auth" / "authentication"), and agent runs are the largest source of that drift. Advisory, not a
    // closed list - a genuinely new topic still deserves a new label.
    if (existingLabels.length > 0) {
        lines.push(
            `- The folder already uses these labels: ${existingLabels.join(', ')}.`,
            '  Reuse them where they fit; only coin a new label when none of them applies.'
        );
    }
    lines.push('', `Edit ${name} directly.`);
    if (instructions !== '') {
        lines.push('', 'Additional one-time instructions for this run:', instructions);
    }
    return lines.join('\n');
};

// Run the headless agent to append `count` entries of `type` to `name` within `cwd`, streaming its activity line by
// line through `onLine` (claude's stream-json events). Resolves on a clean exit; rejects with a descriptive Error
// otherwise (missing CLI, non-zero exit, timeout, or abort). `existingLabels` is the folder's label vocabulary
// (already bounded by collectFolderLabelsAsync), surfaced in the prompt so runs reuse it instead of coining variants.
const generateSpecsAsync = function ({ cwd, name, type, count, instructions, existingLabels = [], signal, onLine }) {
    return runStreamedAgentAsync({
        cwd,
        prompt: buildPrompt(name, type, count, instructions, existingLabels),
        timeoutMs: GENERATE_TIMEOUT_MS,
        timeoutMessage: 'Spec generation timed out',
        signal,
        onLine
    });
};

export { generateSpecsAsync };
