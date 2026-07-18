// The editor's view-only entry sort. Kept in its own module (not in SpecsEditor.tsx) so the runtime guard can be shared
// with App without tripping react-refresh's "a component file must only export components" rule.

type SortMode = 'file' | 'title' | 'updated' | 'approval' | 'rating';

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
    { value: 'file', label: 'File order' },
    { value: 'title', label: 'Title (A-Z)' },
    { value: 'updated', label: 'Recently updated' },
    { value: 'approval', label: 'Approval status' },
    // Elo rating from the Rankings view's recorded matches; a folder with no recorded results has no ratings, so
    // this sort simply keeps the file order there (every entry ties).
    { value: 'rating', label: 'Rating' }
];

// Narrow an arbitrary string (e.g. a persisted preference read back from localStorage) to a SortMode, so a stale or
// foreign value falls back to the default rather than driving an unknown sort. Derived from SORT_OPTIONS so it never
// drifts if a mode is added or removed.
const isSortMode = function (value: string): value is SortMode {
    return SORT_OPTIONS.some(function (option) { return option.value === value; });
};

export { isSortMode, SORT_OPTIONS };
export type { SortMode };
