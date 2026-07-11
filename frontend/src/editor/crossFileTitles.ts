import type { FileSummary } from '../api.ts';

// The set of entry titles used in files OTHER than `currentPath`. Titles are folder-wide identifiers - a relatesTo
// reference resolves by exact title across every file in the folder - so a title that also appears in another file is
// just as ambiguous as one duplicated within the open file, and the editor flags it the same way. The titles come from
// the saved workspace summary; the open file itself is excluded because its own LIVE (possibly unsaved) entries drive
// the separate within-file duplicate check, and its stale saved titles would otherwise collide with those live ones.
const titlesInOtherFiles = function (summaries: FileSummary[], currentPath: string | null): Set<string> {
    const titles = new Set<string>();
    for (const summary of summaries) {
        if (summary.name === currentPath) {
            continue;
        }
        for (const title of summary.titles) {
            if (title !== '') {
                titles.add(title);
            }
        }
    }
    return titles;
};

export { titlesInOtherFiles };
