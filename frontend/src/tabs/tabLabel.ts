// Shared shape and labelling for an open editor tab, used by both the editor's TabBar and the Explorer's "Open Editors"
// list so the two label tabs identically.
type TabInfo = { path: string; dirty: boolean; label?: string };

const fileName = function (path: string): string {
    return path.split('/').pop() ?? path;
};

// Activity tabs supply an explicit label (the job's name); file tabs fall back to the file's basename.
const tabLabel = function (tab: TabInfo): string {
    return tab.label ?? fileName(tab.path);
};

export { tabLabel };
export type { TabInfo };
