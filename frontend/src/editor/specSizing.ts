// The one-task-one-run scoping heuristic: an entry whose content is large enough that applying or running it means
// one agent run doing many things produces diffs too big to review and runs that overflow their context. The
// thresholds are deliberately generous - the hint should fire on genuinely bloated entries, not nudge every
// well-fleshed spec - and purely mechanical (length and bullet count), because a smarter judgment would need an
// agent run and this needs to be free.
const OVERSIZE_CHARACTER_THRESHOLD = 2500;
const OVERSIZE_BULLET_THRESHOLD = 10;

// Lines that read as list items: "-", "*", "+", "1." / "1)" markers. Counted as a proxy for "how many separate
// things does this entry ask for".
const BULLET_LINE = /^\s*(?:[-*+]|\d+[.)])\s+/;

// A short muted hint for a spec/task whose content looks too big for one focused run, or null when the size is fine
// (including for review/idea entries, which have no run to scope). The message names the numbers that tripped it so
// the author knows what "large" meant.
const describeOversize = function (entry: { type: string; content: string }): string | null {
    if (entry.type !== 'spec' && entry.type !== 'task') {
        return null;
    }
    const content = entry.content.trim();
    const characterCount = content.length;
    const bulletCount = content.split('\n').filter(function (line) { return BULLET_LINE.test(line); }).length;
    if (characterCount <= OVERSIZE_CHARACTER_THRESHOLD && bulletCount <= OVERSIZE_BULLET_THRESHOLD) {
        return null;
    }
    const reasons = [];
    if (characterCount > OVERSIZE_CHARACTER_THRESHOLD) {
        reasons.push(`about ${Math.round(characterCount / 100) * 100} characters`);
    }
    if (bulletCount > OVERSIZE_BULLET_THRESHOLD) {
        reasons.push(`${bulletCount} bullet points`);
    }
    return `Large ${entry.type} (${reasons.join(', ')}) - consider splitting it: one focused entry per agent run keeps the diff reviewable.`;
};

export { describeOversize, OVERSIZE_BULLET_THRESHOLD, OVERSIZE_CHARACTER_THRESHOLD };
