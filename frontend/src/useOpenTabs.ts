import { useCallback, useEffect, useRef, useState } from 'react';

import { getFile } from './api.ts';
import { parseRunbooksXml, type Truth } from './runbooksXml.ts';

type TabStatus = { kind: 'idle' } | { kind: 'saving' } | { kind: 'error'; message: string };

type InnerTab = 'structured' | 'raw';

// Everything that used to be a single open file's state, now held once per open tab. The models live here so a tab's
// unsaved edits survive switching to another tab (switching only changes activePath, never these arrays).
type TabState = {
    path: string; // unique key and sidebar identity
    loading: boolean; // initial getFile() still in flight
    reloading: boolean; // reload-from-disk in flight
    truths: Truth[];
    rawFallback: string; // original XML, shown in the raw view when parsing failed
    parseError: string | null;
    innerTab: InnerTab; // the structured/raw toggle, independent per tab
    status: TabStatus;
    dirty: boolean;
    reloadNonce: number // bumped on reload so the editor remounts even though the path is unchanged
};

// tabs and the active path are kept in one state object so closing the active tab can pick its replacement atomically.
type TabsState = { tabs: TabState[]; activePath: string | null };

const newTab = function (path: string): TabState {
    return {
        path,
        loading: true,
        reloading: false,
        truths: [],
        rawFallback: '',
        parseError: null,
        innerTab: 'structured',
        status: { kind: 'idle' },
        dirty: false,
        reloadNonce: 0
    };
};

// Owns the set of open tabs and which one is active. Opening focuses an already-open tab or creates a new one; a new
// tab's content is fetched by the effect below. Editing/saving/reloading flow through patchTab from App.
const useOpenTabs = function () {
    const [state, setState] = useState<TabsState>({ tabs: [], activePath: null });
    // Paths whose initial content has been requested, so the load effect fetches each new tab exactly once. An entry is
    // dropped when its tab closes, letting a reopened file fetch fresh.
    const requestedPathsReference = useRef<Set<string>>(new Set());

    const patchTab = useCallback(function (path: string, patch: Partial<TabState>) {
        setState(function (previous) {
            return {
                ...previous,
                tabs: previous.tabs.map(function (tab) {
                    return tab.path === path ? { ...tab, ...patch } : tab;
                })
            };
        });
    }, []);

    const setActive = useCallback(function (path: string) {
        setState(function (previous) {
            return { ...previous, activePath: path };
        });
    }, []);

    const setInnerTab = useCallback(function (path: string, innerTab: InnerTab) {
        patchTab(path, { innerTab });
    }, [patchTab]);

    const openOrFocus = useCallback(function (path: string) {
        setState(function (previous) {
            if (previous.tabs.some(function (tab) { return tab.path === path; })) {
                return { ...previous, activePath: path };
            }
            return { tabs: [...previous.tabs, newTab(path)], activePath: path };
        });
    }, []);

    const closeTab = useCallback(function (path: string) {
        setState(function (previous) {
            const index = previous.tabs.findIndex(function (tab) { return tab.path === path; });
            if (index === -1) {
                return previous;
            }
            const tabs = previous.tabs.filter(function (tab) { return tab.path !== path; });
            let activePath = previous.activePath;
            if (activePath === path) {
                // Closing the active tab activates its right neighbor, else its left, else nothing remains open.
                const neighbor = previous.tabs[index + 1] ?? previous.tabs[index - 1] ?? null;
                activePath = neighbor === null ? null : neighbor.path;
            }
            return { tabs, activePath };
        });
    }, []);

    // Fetch each newly-created tab's content once. A fetch that finishes after its tab was closed is dropped via the
    // every()-guard before patching, so a stale response never resurrects a closed tab.
    useEffect(function () {
        const requested = requestedPathsReference.current;
        const openPaths = new Set(state.tabs.map(function (tab) { return tab.path; }));
        for (const path of requested) {
            if (!openPaths.has(path)) {
                requested.delete(path);
            }
        }

        const loadAsync = async function (path: string) {
            try {
                const content = await getFile(path);
                setState(function (previous) {
                    if (previous.tabs.every(function (tab) { return tab.path !== path; })) {
                        return previous;
                    }
                    return {
                        ...previous,
                        tabs: previous.tabs.map(function (tab) {
                            return tab.path === path ?
                                { ...tab, loading: false, truths: parseRunbooksXml(content), rawFallback: content, parseError: null } :
                                tab;
                        })
                    };
                });
            } catch (error) {
                const message = (error as Error).message;
                setState(function (previous) {
                    if (previous.tabs.every(function (tab) { return tab.path !== path; })) {
                        return previous;
                    }
                    return {
                        ...previous,
                        tabs: previous.tabs.map(function (tab) {
                            return tab.path === path ? { ...tab, loading: false, truths: [], parseError: message } : tab;
                        })
                    };
                });
            }
        };

        for (const tab of state.tabs) {
            if (!tab.loading || requested.has(tab.path)) {
                continue;
            }
            requested.add(tab.path);
            void loadAsync(tab.path);
        }
    }, [state.tabs]);

    const activeTab = state.tabs.find(function (tab) { return tab.path === state.activePath; }) ?? null;
    const anyDirty = state.tabs.some(function (tab) { return tab.dirty; });

    return {
        tabs: state.tabs,
        activePath: state.activePath,
        activeTab,
        anyDirty,
        openOrFocus,
        closeTab,
        setActive,
        setInnerTab,
        patchTab
    };
};

export { type TabState, type TabStatus, useOpenTabs };
