import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { runStreamedAgentAsync } from '../shared/spawnClaude.js';

// Give the headless agent room to read the codebase and edit files - and, when the Ralph loop is on, to iterate across
// many passes; reject rather than hang forever if it stalls.
const RUN_TASK_TIMEOUT_MS = 60 * 60 * 1000;

// The ralph-loop plugin's per-project state file (relative to the run's cwd). It normally removes this itself on a
// clean finish or when --max-iterations is hit; we only clear any copy left behind by an abort/timeout mid-loop.
const RALPH_STATE_FILE = join('.claude', 'ralph-loop.local.md');

// The instruction handed to "claude -p". It carries out a single task against the project, editing files on disk as
// needed. The <notes> line is omitted when the task has none. `options` carries the directive block derived from the
// task's per-run options form, and `instructions` carries optional custom one-time guidance the user supplied for this
// run; each is appended as an extra block only when non-empty. When `isRalphLoopEnabled` is set, a block telling the
// agent to drive the run as a Ralph loop is appended after the options. Options and the Ralph block come first so
// explicit instructions still read as the final word.
const buildPrompt = function ({ title, content, notes, options, instructions, isRalphLoopEnabled }) {
    const lines = [
        'Carry out the following task for this project. Read it, then do the work it describes, editing files',
        'directly as needed.',
        '',
        `Title: ${title}`,
        `Content: ${content}`
    ];
    if (notes !== '') {
        lines.push(`Notes: ${notes}`);
    }
    if (options !== '') {
        lines.push('', 'Selected options for this run:', options);
    }
    if (isRalphLoopEnabled) {
        lines.push(
            '',
            'This run uses the Ralph loop: iterate until the task is verifiably complete instead of doing a single pass.',
            '- Before starting the work, start the loop for this session by invoking the ralph-loop skill (the',
            '  "/ralph-loop" command).',
            "- Choose the iteration limit yourself via --max-iterations, sized to this task's scope: enough iterations to",
            '  make incremental progress and self-correct, but bounded by a sensible cap so the loop cannot run away.',
            "- Set a completion promise: --completion-promise 'TASK COMPLETE'.",
            "- Do the task's work each iteration. Only output <promise>TASK COMPLETE</promise> once the task is genuinely",
            '  and verifiably done - the work is complete, the app builds, and the existing checks pass. Do not output it',
            '  early, and do not output it falsely to escape the loop.'
        );
    }
    if (instructions !== '') {
        lines.push('', 'Additional one-time instructions for this run:', instructions);
    }
    return lines.join('\n');
};

// Run the headless agent to carry out the given task against `cwd`, streaming its activity line by line through
// `onLine` (claude's stream-json events). Resolves on a clean exit; rejects with a descriptive Error otherwise (missing
// CLI, non-zero exit, timeout, or abort). `isRalphLoopEnabled` is the structured per-run opt-in the frontend derives
// from the options form's `useRalphLoop` property KEY (see taskOptions.ts) - the rendered "- Use Ralph loop: yes"
// line still appears in `options` for the agent to read, but it is presentation, not the control channel.
const runTaskAsync = async function ({ cwd, title, content, notes, options, instructions, isRalphLoopEnabled, signal, onLine }) {
    try {
        return await runStreamedAgentAsync({
            cwd,
            prompt: buildPrompt({ title, content, notes, options, instructions, isRalphLoopEnabled }),
            timeoutMs: RUN_TASK_TIMEOUT_MS,
            timeoutMessage: 'Running the task timed out',
            signal,
            onLine
        });
    } finally {
        // Clear any ralph-loop state file the run left behind (abort/timeout mid-loop) so it can't disrupt a later run.
        if (isRalphLoopEnabled) {
            rmSync(join(cwd, RALPH_STATE_FILE), { force: true });
        }
    }
};

export { runTaskAsync };
