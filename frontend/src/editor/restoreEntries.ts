import { type Spec } from '../xml/vibraryXml.ts';

// One entry changed in place by a bulk edit: the pre-op spec to put back, and the exact `after` object the op produced
// (used to tell whether the entry is still untouched at Undo time).
type EntryChange = { before: Spec; after: Spec };

// Undo an in-place bulk edit (Find & replace, Remove broken references) by restoring each changed entry to its pre-op
// `before` state - but only where the entry is still present AND has not been edited since. "Not edited since" is exact
// object identity against the `after` spec the op produced: the editor swaps an entry's object on every edit and the tab
// store keeps spec references as-is (App's onChange -> patchTab does not clone them), so a surviving === match means the
// user has not touched that entry at all - across ANY field - since the op. A later edit yields a different object and a
// delete removes it; either way the entry is left alone rather than clobbered. This is the in-place counterpart to
// reinsertEntries (which re-adds removed entries); both follow the same live-list, never-eat-a-later-edit rule.
const restoreEntries = function (current: Spec[], changes: EntryChange[]): Spec[] {
    const byId = new Map(changes.map(function (change) { return [change.before.id, change]; }));
    return current.map(function (spec) {
        const change = byId.get(spec.id);
        return change !== undefined && spec === change.after ? change.before : spec;
    });
};

export { restoreEntries, type EntryChange };
