// Where a drafted implementation plan lives on its entry: appended to the notes under this heading. The notes field
// is the right home because it already rides the apply prompt (runClaudeApplyBatch includes a Notes line), so a
// reviewed - possibly hand-corrected - plan steers the apply run with no extra plumbing, and the plan is editable
// exactly like any other note text.
const PLAN_HEADING = '## Implementation plan';

// Whether the notes already carry a plan section, which flips the card's Apply label to "Apply with plan".
const hasPlan = function (notes: string): boolean {
    return notes.includes(PLAN_HEADING);
};

// Fold a freshly drafted plan into the notes: everything before an existing plan section is kept, the old plan (it
// runs to the end of the notes - the heading is appended last by this same function) is replaced, and the new plan
// lands under the heading. Re-planning therefore never stacks stale plans, and hand-written notes above the heading
// survive every redraft.
const withPlan = function (notes: string, plan: string): string {
    const headingIndex = notes.indexOf(PLAN_HEADING);
    const base = (headingIndex === -1 ? notes : notes.slice(0, headingIndex)).trimEnd();
    return `${base === '' ? '' : `${base}\n\n`}${PLAN_HEADING}\n\n${plan.trim()}`;
};

export { hasPlan, PLAN_HEADING, withPlan };
