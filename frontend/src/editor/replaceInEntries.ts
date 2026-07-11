import { type Spec } from '../xml/vibraryXml.ts';

// Occurrences of the non-empty `needle` in `text` (a plain substring count, the same the replace performs).
const countOccurrences = function (text: string, needle: string): number {
    return text.split(needle).length - 1;
};

// The total number of occurrences of `find` in the content and notes of the entries selected by `selectedIds` - what a
// Find & replace would change. Titles are excluded on purpose: they are identifiers that relatesTo references resolve
// by, so rewriting them would silently break links. An empty `find` matches nothing.
const countReplaceable = function (specs: Spec[], find: string, selectedIds: Set<string>): number {
    if (find === '') {
        return 0;
    }
    let total = 0;
    for (const spec of specs) {
        if (selectedIds.has(spec.id)) {
            total += countOccurrences(spec.content, find) + countOccurrences(spec.notes, find);
        }
    }
    return total;
};

// Replace every occurrence of `find` with `replace` in the content and notes of the selected entries, stamping each
// entry that actually changed as a fresh human edit (with `now`). Titles are left untouched (see countReplaceable).
// Returns the rewritten list plus how many occurrences were replaced and how many entries changed, so the caller can
// report the result and skip a no-op. Case-sensitive substring replace; an empty `find` is a no-op.
const replaceInEntries = function (specs: Spec[], find: string, replace: string, selectedIds: Set<string>, now: string) {
    if (find === '') {
        return { specs, occurrences: 0, entriesChanged: 0 };
    }
    let occurrences = 0;
    let entriesChanged = 0;
    const nextSpecs = specs.map(function (spec) {
        if (!selectedIds.has(spec.id)) {
            return spec;
        }
        // split/join does a purely literal replacement (matching countOccurrences' own split): no regex, and no "$&"
        // / "$1" interpretation that a string replaceAll would apply to the user's `replace` text.
        const content = spec.content.split(find).join(replace);
        const notes = spec.notes.split(find).join(replace);
        // Skip an entry whose text did not actually change - the term was absent, OR find === replace, which produces
        // byte-identical text and must not stamp a spurious edit or inflate the count.
        if (content === spec.content && notes === spec.notes) {
            return spec;
        }
        occurrences += countOccurrences(spec.content, find) + countOccurrences(spec.notes, find);
        entriesChanged += 1;
        return { ...spec, content, notes, updated: now, updatedBy: 'Human' as const };
    });
    return { specs: nextSpecs, occurrences, entriesChanged };
};

export { countReplaceable, replaceInEntries };
