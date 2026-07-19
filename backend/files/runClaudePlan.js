import { runStreamedAgentAsync } from '../shared/spawnClaude.js';

// Planning reads the codebase but writes nothing, so it needs research room without an apply run's editing budget; a
// stalled plan should fail well before an apply would.
const PLAN_TIMEOUT_MS = 15 * 60 * 1000;

// The instruction handed to "claude -p" for the plan-first checkpoint: research the codebase and answer with an
// implementation plan as the FINAL MESSAGE, explicitly without editing anything. The run cannot be mechanically
// prevented from writing (every agent run executes with permission prompts disabled - see spawnClaude.js), so the
// prompt is the guardrail and the docs say so; what makes the checkpoint work is that a reviewed plan then rides the
// apply run's prompt, giving the human a steer point BEFORE code changes instead of after. The plan is asked for as
// plain markdown so the frontend can drop it into the entry's notes verbatim.
const buildPlanPrompt = function ({ title, content, notes, instructions }) {
    const lines = [
        'Write an implementation plan for the following spec against this project\'s codebase. Research the code',
        'first (read any files you need), then respond with the plan as your final message.',
        '',
        'Do NOT edit, create, or delete any files in this run: this is a plan-review checkpoint - a human reviews',
        'and possibly corrects the plan before any code is written.',
        '',
        `Title: ${title}`,
        `Content: ${content}`
    ];
    if (notes !== '') {
        lines.push(`Notes: ${notes}`);
    }
    if (instructions !== '') {
        lines.push('', 'Additional one-time instructions for this plan:', instructions);
    }
    lines.push(
        '',
        'Answer with ONLY the plan, as concise markdown: the approach in a sentence or two, then the concrete steps',
        '(files to touch and what changes in each), then any risks or open questions a reviewer should weigh in on.',
        'Keep it short enough to review in a minute or two - a plan longer than the diff it proposes is a burden,',
        'not a checkpoint.'
    );
    return lines.join('\n');
};

// Run the headless agent to draft an implementation plan for one spec, streaming its research activity through
// `onLine`. The plan itself arrives as the stream's final result text; the FRONTEND writes it into the entry's notes
// through the normal editor save path, so the plan lands with the same conflict detection as any human edit and this
// run stays (by instruction) read-only. Resolves on a clean exit; rejects with a descriptive Error otherwise.
const planSpecAsync = function ({ cwd, title, content, notes, instructions, signal, onLine }) {
    return runStreamedAgentAsync({
        cwd,
        prompt: buildPlanPrompt({ title, content, notes, instructions }),
        timeoutMs: PLAN_TIMEOUT_MS,
        timeoutMessage: `Drafting the plan timed out after ${Math.round(PLAN_TIMEOUT_MS / 60000)} minutes`,
        signal,
        onLine
    });
};

export { buildPlanPrompt, planSpecAsync };
