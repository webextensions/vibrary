// The relatesTo references that resolve to no entry: a title listed in `relatesTo` but absent from `knownTitles` - the
// set of every title that exists folder-wide plus the open file's live (possibly unsaved) entries. A relatesTo
// reference navigates by exact title, so a dangling one - left behind when its target was renamed or removed - silently
// goes nowhere; surfacing it lets the editor flag the broken link. Order is preserved, matching the reference list.
const danglingRelations = function (relatesTo: string[], knownTitles: Set<string>): string[] {
    return relatesTo.filter(function (title) {
        return !knownTitles.has(title);
    });
};

export { danglingRelations };
