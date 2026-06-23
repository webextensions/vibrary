import { spawn } from 'node:child_process';

// Give the headless agent room to read the codebase and write the file; reject rather than hang forever if it stalls.
const GENERATE_TIMEOUT_MS = 10 * 60 * 1000;

// The instruction handed to "claude -p". It edits the target file on disk directly; <contentHash> is left empty because
// the editor recomputes it from <content> on load (see truthsXmlCore.parseTruthsXml).
const buildPrompt = function (name, count) {
    return [
        `Add exactly ${count} new <truth> entries to the file "${name}" in this project.`,
        '',
        `First read docs/truths-file-format.md to learn the XML format, then read the existing truths in ${name} and`,
        'explore the project\'s codebase to find accurate, non-obvious facts about it worth capturing as truths.',
        '',
        'Rules:',
        `- Append ${count} new <truth> elements inside the existing <truths> wrapper. Do not modify or delete existing`,
        '  truths.',
        '- Each new truth must be distinct from the existing truths and from each other.',
        '- Each <truth> has these child elements in this order: <title>, <createdBy>, <approved>, <content>,',
        '  <contentHash>, <relatesTo>, <notes>, <labels>, <created>, <lastUpdated>, <updatedBy>.',
        '- Set <createdBy>AI</createdBy> and <updatedBy>AI</updatedBy>. Leave <approved></approved> and',
        '  <contentHash></contentHash> empty (the editor recomputes the hash on load).',
        '- Set <created> and <lastUpdated> to the current UTC time in ISO 8601 (for example 2026-06-24T12:00:00.000Z).',
        '- Use a hyphenated lowercase <title>. Add relevant <label> entries under <labels>, and add <ref> entries under',
        '  <relatesTo> pointing to existing truth titles where they genuinely relate.',
        '- Keep the file valid XML, matching the existing structure and four-space indentation.',
        '',
        `Edit ${name} directly.`
    ].join('\n');
};

// Run the headless agent to append `count` truths to `name` within `cwd`. Resolves with the CLI's raw stdout on a clean
// exit (the caller forwards it to the browser console for debugging); rejects with a descriptive Error otherwise
// (missing CLI, non-zero exit, or timeout).
const generateTruthsAsync = function ({ cwd, name, count }) {
    return new Promise(function (resolve, reject) {
        const child = spawn(
            'claude',
            ['-p', buildPrompt(name, count), '--dangerously-skip-permissions'],
            { cwd, timeout: GENERATE_TIMEOUT_MS }
        );

        let stdout = '';
        let stderr = '';
        child.stdout.on('data', function (chunk) {
            stdout += chunk.toString();
        });
        child.stderr.on('data', function (chunk) {
            stderr += chunk.toString();
        });

        child.on('error', function (error) {
            if (error.code === 'ENOENT') {
                reject(new Error('Claude CLI not found on PATH'));
                return;
            }
            reject(error);
        });

        child.on('close', function (code, signal) {
            if (signal === 'SIGTERM') {
                reject(new Error('Truth generation timed out'));
                return;
            }
            if (code === 0) {
                resolve(stdout);
                return;
            }
            reject(new Error(stderr.trim() || `Claude exited with code ${code}`));
        });
    });
};

export { generateTruthsAsync };
