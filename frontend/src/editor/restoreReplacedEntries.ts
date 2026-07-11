import { type Spec } from '../xml/vibraryXml.ts';

// One entry a Find & replace rewrote: the whole pre-replace spec (to restore verbatim, including its old
// updated/updatedBy stamp) plus the content/notes the replace left behind, used to tell whether the entry is still
// untouched at Undo time.
type ReplacedEntry = { before: Spec; afterContent: string; afterNotes: string };

// Undo a Find & replace by restoring each rewritten entry to its pre-replace state - but only where the entry is still
// present AND still holds exactly the text the replace produced. If the user has since edited that entry's content or
// notes (or it was deleted), it is left alone rather than clobbered: the same live-list, no-surprise-loss rule the
// bulk-delete Undo follows (see reinsertEntries). Restoring the whole `before` spec reverts content, notes, and the
// updated/updatedBy stamp together, since those are all the replace touched.
const restoreReplacedEntries = function (current: Spec[], replaced: ReplacedEntry[]): Spec[] {
    const byId = new Map(replaced.map(function (entry) { return [entry.before.id, entry]; }));
    return current.map(function (spec) {
        const entry = byId.get(spec.id);
        if (entry !== undefined && spec.content === entry.afterContent && spec.notes === entry.afterNotes) {
            return entry.before;
        }
        return spec;
    });
};

export { restoreReplacedEntries, type ReplacedEntry };
