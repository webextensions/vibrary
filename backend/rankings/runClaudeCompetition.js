import { runBufferedAgentAsync } from '../shared/spawnClaude.js';

// One judged pairing is a quick, read-free prompt task (the entries' text is IN the prompt); cap it like the other
// buffered helpers so a stalled judge fails fast instead of holding the single agent slot for the full run budget.
const COMPETITION_TIMEOUT_MS = 2 * 60 * 1000;

const describeContender = function (label, entry) {
    const lines = [`${label} - "${entry.title}":`, entry.content === '' ? '(no content)' : entry.content];
    if (entry.notes !== '') {
        lines.push(`Notes: ${entry.notes}`);
    }
    return lines.join('\n');
};

// The judge's instruction: both entries in full, the user's optional judging guidance, and a demand for a bare JSON
// verdict naming one of the two exact titles - strict enough that the stdout can be parsed mechanically, with the
// rationale captured for the match history so an AI verdict is never an unexplained rating change.
const buildCompetitionPrompt = function ({ first, second, instructions }) {
    const sections = [
        'You are judging a head-to-head competition between two backlog entries to decide which one is more',
        'important to pursue first. Weigh user impact, urgency, effort, and how much other work depends on each.',
        '',
        describeContender('Entry A', first),
        '',
        describeContender('Entry B', second)
    ];
    if (instructions !== '') {
        sections.push('', 'Additional judging guidance from the user:', instructions);
    }
    sections.push(
        '',
        `The winner must be exactly "${first.title}" or "${second.title}".`,
        'Respond with ONLY one JSON object on a single line - no code fences, no other text - shaped as:',
        '{"winner": "<the winning entry\'s exact title>", "rationale": "<one short paragraph explaining the choice>"}'
    );
    return sections.join('\n');
};

// Reduce the judge's stdout to a validated verdict. Models wrap JSON in prose or fences often enough that the parser
// takes the first "{" through the last "}" rather than demanding a perfectly bare object; everything else IS strict:
// unparseable JSON or a winner that is not one of the two contenders rejects the whole pairing (the route surfaces
// the message), because guessing a winner would silently corrupt the standings the user trusts.
const parseVerdict = function (output, titles) {
    const start = output.indexOf('{');
    const end = output.lastIndexOf('}');
    if (start === -1 || end <= start) {
        throw new Error('The judge did not answer with a JSON verdict');
    }
    let verdict;
    try {
        verdict = JSON.parse(output.slice(start, end + 1));
    } catch (error) {
        throw new Error(`The judge's verdict was not valid JSON: ${error.message}`, { cause: error });
    }
    if (!titles.includes(verdict.winner)) {
        throw new Error(`The judge named "${String(verdict.winner)}", which is neither contender`);
    }
    return { winner: verdict.winner, rationale: typeof verdict.rationale === 'string' ? verdict.rationale : '' };
};

// Run one AI-judged pairing through the shared buffered recipe. Resolves with { winner, rationale }; rejects with a
// descriptive Error (missing CLI, timeout, unparseable or invalid verdict) that fails just this competition run.
const judgeCompetitionAsync = async function ({ cwd, first, second, instructions, signal }) {
    const stdout = await runBufferedAgentAsync({
        cwd,
        prompt: buildCompetitionPrompt({ first, second, instructions }),
        timeoutMs: COMPETITION_TIMEOUT_MS,
        timeoutMessage: 'Judging the competition timed out',
        signal
    });
    return parseVerdict(stdout, [first.title, second.title]);
};

export { buildCompetitionPrompt, judgeCompetitionAsync, parseVerdict };
