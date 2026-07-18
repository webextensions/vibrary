// Rebind an open tab to a new path after its file was renamed on disk. The entries, the dirty flag and the fileHash
// all carry over: a rename moves the bytes without changing them, so the version token the save route's lost-update
// guard checks stays valid. This is a REKEY of the tab, not a close-and-reopen - reopening from disk is what used to
// discard unsaved edits on every rename. Pure and generic over the tab shape so it runs under node --test; the hook
// wraps it in a state update.
type RekeyableState<Tab extends { path: string }> = { tabs: Tab[]; activePath: string | null };

const rekeyTabsState = function <Tab extends { path: string }>(state: RekeyableState<Tab>, oldPath: string, newPath: string): RekeyableState<Tab> {
    if (state.tabs.every(function (tab) { return tab.path !== oldPath; })) {
        return state;
    }
    return {
        ...state,
        tabs: state.tabs.map(function (tab) {
            return tab.path === oldPath ? { ...tab, path: newPath } : tab;
        }),
        // The active tab follows its file's new name, so the rename never yanks focus elsewhere.
        activePath: state.activePath === oldPath ? newPath : state.activePath
    };
};

export { rekeyTabsState };
