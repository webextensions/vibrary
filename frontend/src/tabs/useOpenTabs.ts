import { useCallback, useEffect, useRef, useState } from 'react';

import { loadVibraryFile, type SchemaMap } from '../editor/loadVibraryFile.ts';
import { rekeyTabsState } from './rekeyTabs.ts';
import { type Spec } from '../xml/vibraryXml.ts';

type TabStatus = { kind: 'idle' } | { kind: 'saving' } | { kind: 'error'; message: string };

type InnerTab = 'structured' | 'raw';

// Everything that used to be a single open file's state, now held once per open tab. The models live here so a tab's
// unsaved edits survive switching to another tab (switching only changes activePath, never these arrays). Tabs are
// polymorphic: a 'file' tab edits a vibrary file; an 'activity' tab shows a queued job's live detail (keyed by jobId,
// rendered from the activity queue) and carries no file state.
type TabState = {
    path: string; // unique key and sidebar identity ('activity:<jobId>' for activity tabs)
    kind: 'file' | 'activity';
    jobId?: string; // activity tabs only: the job this tab tracks
    title?: string; // activity tabs only: the label shown in the tab strip
    loading: boolean; // initial getFile() still in flight (file tabs only)
    reloading: boolean; // reload-from-disk in flight
    specs: Spec[];
    schemas: SchemaMap; // resolved option-form schemas for this file's entries, keyed by formSchemaRef
    rawFallback: string; // original XML, shown in the raw view when parsing failed
    fileHash: string; // the server's version token for the loaded content, echoed on save to detect on-disk changes
    parseError: string | null;
    innerTab: InnerTab; // the structured/raw toggle, independent per tab
    status: TabStatus;
    dirty: boolean;
    reloadNonce: number // bumped on reload so the editor remounts even though the path is unchanged
};

// tabs and the active path are kept in one state object so closing the active tab can pick its replacement atomically.
// closedPaths is a LIFO of recently-closed file tabs' paths (activity tabs are not tracked - reopening a finished job's
// tab has nothing to fetch, and the job itself already lives in the Activity monitor), kept in the same object so a
// close and its history entry commit together.
type TabsState = { tabs: TabState[]; activePath: string | null; closedPaths: string[] };

// Caps how many recently-closed paths are remembered, so a long session's history does not grow unbounded.
const CLOSED_TABS_LIMIT = 20;

const newTab = function (path: string): TabState {
    return {
        path,
        kind: 'file',
        loading: true,
        reloading: false,
        specs: [],
        schemas: {},
        rawFallback: '',
        fileHash: '',
        parseError: null,
        innerTab: 'structured',
        status: { kind: 'idle' },
        dirty: false,
        reloadNonce: 0
    };
};

// Built on newTab so a future TabState field only needs one constructor; the overrides are what makes an activity tab
// different: its kind/job identity, and nothing to fetch (content is read live from the activity queue).
const newActivityTab = function (jobId: string, title: string): TabState {
    return {
        ...newTab(`activity:${jobId}`),
        kind: 'activity',
        jobId,
        title,
        loading: false
    };
};

// Owns the set of open tabs and which one is active. Opening focuses an already-open tab or creates a new one; a new
// tab's content is fetched by the effect below. Editing/saving/reloading flow through patchTab from App.
const useOpenTabs = function () {
    const [state, setState] = useState<TabsState>({ tabs: [], activePath: null, closedPaths: [] });
    // Paths whose initial content has been requested, so the load effect fetches each new tab exactly once. An entry is
    // dropped when its tab closes, letting a reopened file fetch fresh.
    const requestedPathsReference = useRef<Set<string>>(new Set());
    // Live mirror of state so getTab can read the CURRENT tab after an await (a long agent run), when the caller's
    // captured `tabs` closure is stale - e.g. deciding whether a generate reload would clobber edits made mid-run.
    // Mirrored in an effect (not during render) so the ref is only touched after commit.
    const stateReference = useRef(state);
    useEffect(function () {
        stateReference.current = state;
    }, [state]);

    const getTab = useCallback(function (path: string): TabState | null {
        return stateReference.current.tabs.find(function (tab) { return tab.path === path; }) ?? null;
    }, []);

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
            return { ...previous, tabs: [...previous.tabs, newTab(path)], activePath: path };
        });
    }, []);

    // Open (or focus) an activity tab for a queued job. Its content is read live from the activity queue, so unlike a
    // file tab there is nothing to fetch.
    const openActivity = useCallback(function (jobId: string, title: string) {
        const path = `activity:${jobId}`;
        setState(function (previous) {
            if (previous.tabs.some(function (tab) { return tab.path === path; })) {
                return { ...previous, activePath: path };
            }
            return { ...previous, tabs: [...previous.tabs, newActivityTab(jobId, title)], activePath: path };
        });
    }, []);

    // Close several tabs at once (single close, Close Others, Close All). When the active tab is among those closed,
    // the nearest surviving tab - first to its right, else to its left - becomes active, matching single-close behavior.
    const closeTabs = useCallback(function (paths: string[]) {
        setState(function (previous) {
            const closing = new Set(paths);
            const tabs = previous.tabs.filter(function (tab) { return !closing.has(tab.path); });
            if (tabs.length === previous.tabs.length) {
                return previous;
            }
            let activePath = previous.activePath;
            if (activePath !== null && closing.has(activePath)) {
                const index = previous.tabs.findIndex(function (tab) { return tab.path === activePath; });
                const rightNeighbor = previous.tabs.slice(index + 1).find(function (tab) { return !closing.has(tab.path); });
                const leftNeighbor = previous.tabs.slice(0, index).findLast(function (tab) { return !closing.has(tab.path); });
                activePath = (rightNeighbor ?? leftNeighbor)?.path ?? null;
            }
            const closedFilePaths = previous.tabs
                .filter(function (tab) { return closing.has(tab.path) && tab.kind === 'file'; })
                .map(function (tab) { return tab.path; });
            const closedPaths = closedFilePaths.length === 0 ?
                previous.closedPaths :
                [...previous.closedPaths, ...closedFilePaths].slice(-CLOSED_TABS_LIMIT);
            return { tabs, activePath, closedPaths };
        });
    }, []);

    const closeTab = useCallback(function (path: string) {
        closeTabs([path]);
    }, [closeTabs]);

    // Rebind a tab to its file's new name after a rename (see rekeyTabs.ts - unsaved edits, the dirty flag and the
    // fileHash all survive). A no-op when the old path has no open tab. A tab rekeyed while its initial load is still
    // in flight self-heals: the stale response is dropped by the load effect's open-tab guard, and the effect then
    // fetches the new path (still loading, never requested).
    const rekeyTab = useCallback(function (oldPath: string, newPath: string) {
        setState(function (previous) {
            const next = rekeyTabsState(previous, oldPath, newPath);
            return next === previous ? previous : { ...previous, tabs: next.tabs, activePath: next.activePath };
        });
    }, []);

    // Reopen the most recently closed file tab, popping stale entries (already reopened some other way, e.g. clicked
    // again in the explorer) as it goes. A no-op with nothing to reopen.
    const reopenClosedTab = useCallback(function () {
        setState(function (previous) {
            const openPaths = new Set(previous.tabs.map(function (tab) { return tab.path; }));
            const closedPaths = [...previous.closedPaths];
            let path = closedPaths.pop();
            while (path !== undefined && openPaths.has(path)) {
                path = closedPaths.pop();
            }
            if (path === undefined) {
                return { ...previous, closedPaths };
            }
            return { tabs: [...previous.tabs, newTab(path)], activePath: path, closedPaths };
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
                // A parse failure arrives in-band (parseError set, content still present) so the Raw tab can show the
                // malformed file; only a fetch failure lands in the catch below, where there is no content to show.
                const { content, fileHash, specs, schemas, parseError } = await loadVibraryFile(path);
                setState(function (previous) {
                    if (previous.tabs.every(function (tab) { return tab.path !== path; })) {
                        return previous;
                    }
                    return {
                        ...previous,
                        tabs: previous.tabs.map(function (tab) {
                            return tab.path === path ?
                                { ...tab, loading: false, specs, schemas, rawFallback: content, fileHash, parseError } :
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
                            return tab.path === path ? { ...tab, loading: false, specs: [], schemas: {}, parseError: message } : tab;
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
        closedTabCount: state.closedPaths.length,
        openOrFocus,
        openActivity,
        closeTab,
        closeTabs,
        rekeyTab,
        reopenClosedTab,
        setActive,
        setInnerTab,
        patchTab,
        getTab
    };
};

export { useOpenTabs };
