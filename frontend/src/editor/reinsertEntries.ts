import { type Spec } from '../xml/vibraryXml.ts';

// One entry removed by a bulk delete, paired with the position it held in the list at delete time - enough to put it
// back where it was.
type RemovedEntry = { index: number; spec: Spec };

// Re-insert bulk-deleted entries back into the CURRENT list (not a stale pre-delete snapshot), each at the position it
// held before. Reading the live list is what keeps an Undo from clobbering edits the user made to OTHER entries between
// the delete and the click: only the removed entries are added back, everything present is left as-is. Inserting in
// ascending original-index order makes the positions line up as the list grows (delete B,D from [A,B,C,D,E] -> current
// [A,C,E]; insert B at 1 then D at 3 -> [A,B,C,D,E]). An entry whose id is already present is skipped, so a double-click
// (or an Undo after the user manually re-created one) never duplicates it; an index past the current end clamps to the
// end rather than throwing.
const reinsertEntries = function (current: Spec[], removed: RemovedEntry[]): Spec[] {
    const result = [...current];
    const presentIds = new Set(current.map(function (spec) { return spec.id; }));
    const ascending = removed.toSorted(function (a, b) { return a.index - b.index; });
    for (const { index, spec } of ascending) {
        if (presentIds.has(spec.id)) {
            continue;
        }
        result.splice(Math.min(index, result.length), 0, spec);
        presentIds.add(spec.id);
    }
    return result;
};

export { reinsertEntries, type RemovedEntry };
