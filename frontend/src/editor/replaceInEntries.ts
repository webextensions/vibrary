import { type Spec } from '../xml/vibraryXml.ts';

// Occurrences of the non-empty `needle` in `text`, honoring `isCaseSensitive`. A plain substring count (the same the
// replace performs), via split - no regex, so a needle with regex-special characters counts literally.
const countOccurrences = function (text: string, needle: string, isCaseSensitive: boolean): number {
    const haystack = isCaseSensitive ? text : text.toLowerCase();
    const target = isCaseSensitive ? needle : needle.toLowerCase();
    return haystack.split(target).length - 1;
};

// Literal replacement of every occurrence of `find` with `replace` in `text`. Case-sensitive is a split/join (literal
// on both sides - no regex, no "$&"/"$1" interpretation of `replace`). Case-insensitive can't use split/join, so it
// scans manually: match on a lowercased copy but copy the original text through, so only the matched runs are swapped
// and the surrounding text keeps its case. `find` is assumed non-empty.
const replaceOnce = function (text: string, find: string, replace: string, isCaseSensitive: boolean): string {
    if (isCaseSensitive) {
        return text.split(find).join(replace);
    }
    const lowerText = text.toLowerCase();
    const lowerFind = find.toLowerCase();
    let result = '';
    let index = 0;
    while (index < text.length) {
        if (lowerText.startsWith(lowerFind, index)) {
            result += replace;
            index += find.length;
        } else {
            result += text[index];
            index += 1;
        }
    }
    return result;
};

// The total number of occurrences of `find` in the content and notes of the entries selected by `selectedIds` - what a
// Find & replace would change. Titles are excluded on purpose: they are identifiers that relatesTo references resolve
// by, so rewriting them would silently break links. An empty `find` matches nothing.
const countReplaceable = function (specs: Spec[], find: string, selectedIds: Set<string>, isCaseSensitive: boolean): number {
    if (find === '') {
        return 0;
    }
    let total = 0;
    for (const spec of specs) {
        if (selectedIds.has(spec.id)) {
            total += countOccurrences(spec.content, find, isCaseSensitive) + countOccurrences(spec.notes, find, isCaseSensitive);
        }
    }
    return total;
};

// Replace every occurrence of `find` with `replace` in the content and notes of the selected entries, stamping each
// entry that actually changed as a fresh human edit (with `now`). Titles are left untouched (see countReplaceable).
// Returns the rewritten list plus how many occurrences were replaced and how many entries changed, so the caller can
// report the result and skip a no-op. An empty `find` is a no-op.
const replaceInEntries = function (specs: Spec[], find: string, replace: string, selectedIds: Set<string>, now: string, isCaseSensitive: boolean) {
    if (find === '') {
        return { specs, occurrences: 0, entriesChanged: 0 };
    }
    let occurrences = 0;
    let entriesChanged = 0;
    const nextSpecs = specs.map(function (spec) {
        if (!selectedIds.has(spec.id)) {
            return spec;
        }
        const content = replaceOnce(spec.content, find, replace, isCaseSensitive);
        const notes = replaceOnce(spec.notes, find, replace, isCaseSensitive);
        // Skip an entry whose text did not actually change - the term was absent, OR find === replace, which produces
        // byte-identical text and must not stamp a spurious edit or inflate the count.
        if (content === spec.content && notes === spec.notes) {
            return spec;
        }
        occurrences += countOccurrences(spec.content, find, isCaseSensitive) + countOccurrences(spec.notes, find, isCaseSensitive);
        entriesChanged += 1;
        return { ...spec, content, notes, updated: now, updatedBy: 'Human' as const };
    });
    return { specs: nextSpecs, occurrences, entriesChanged };
};

export { countReplaceable, replaceInEntries };
