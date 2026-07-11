import { type Backlinks, type FileSummary } from '../api.ts';

// How many relatesTo references from files that will SURVIVE a delete point at entry titles that the delete removes from
// the folder entirely - i.e. links that will become broken. Used to warn before an irreversible file delete.
//
// A title only truly disappears if no surviving file still carries it (relatesTo resolves by exact title folder-wide, so
// a title duplicated in a kept file keeps resolving). References that live in the deleted files themselves do not count -
// they are going away too. Titles are matched against the last-saved summary, consistent with the rest of the folder view.
const countBreakingReferences = function (deletedPaths: string[], fileSummaries: FileSummary[], backlinks: Backlinks): number {
    const deleted = new Set(deletedPaths);
    const survivingTitles = new Set(
        fileSummaries.filter(function (file) { return !deleted.has(file.name); }).flatMap(function (file) { return file.titles; })
    );
    const goneTitles = new Set(
        fileSummaries
            .filter(function (file) { return deleted.has(file.name); })
            .flatMap(function (file) { return file.titles; })
            .filter(function (title) { return !survivingTitles.has(title); })
    );

    let count = 0;
    for (const title of goneTitles) {
        const sources = Object.hasOwn(backlinks, title) ? backlinks[title] : [];
        for (const source of sources) {
            if (!deleted.has(source.file)) {
                count += 1;
            }
        }
    }
    return count;
};

export { countBreakingReferences };
