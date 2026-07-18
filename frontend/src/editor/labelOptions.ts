// The label input's suggestion list: the FOLDER's saved label vocabulary (from the workspace summary) merged with the
// open file's LIVE labels (in-memory, possibly unsaved) - so a label typed into one entry is immediately offered on
// the next, and a label used in another file is visible before a near-duplicate gets coined. Sorted and unique; the
// per-file options list was what let "auth" and "authentication" coexist unseen across files.
const labelOptions = function (savedFolderLabels: string[], liveSpecs: { labels: string[] }[]): string[] {
    const merged = new Set(savedFolderLabels);
    for (const spec of liveSpecs) {
        for (const label of spec.labels) {
            merged.add(label);
        }
    }
    return [...merged].filter(function (label) {
        return label !== '';
    }).toSorted(function (a, b) {
        return a.localeCompare(b);
    });
};

export { labelOptions };
