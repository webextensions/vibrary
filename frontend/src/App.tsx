import cx from 'classnames';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';

import { useActivityQueueActions } from './activity/activityQueue.ts';
import { generateSpecs, saveFile } from './api.ts';
import { CloseIcon, CodeIcon, FilterIcon, ListIcon, MenuIcon, RefreshIcon, SaveIcon } from './shared/Icons.tsx';
import { LeftPanel } from './components/LeftPanel.tsx';
import { TabBar } from './tabs/TabBar.tsx';
import { SpecsEditor, type Option } from './editor/SpecsEditor.tsx';
import { confirmDialog } from './shared/confirmDialog.ts';
import { loadVibraryFile } from './editor/loadVibraryFile.ts';
import { type EntryType, entryTypeFromName, serializeVibraryXml, type Spec } from './xml/vibraryXml.ts';
import { useFileCounts } from './useFileCounts.ts';
import { useFileOperations } from './useFileOperations.ts';
import { useSessionRestore } from './tabs/useSessionRestore.ts';
import { useOpenTabs } from './tabs/useOpenTabs.ts';

import styles from './App.module.css';

// Load the Raw tab's syntax highlighter on demand: prism/refractor is a sizeable chunk that most sessions (which stay
// on the Structured tab) never need. lazy() wants a default export, so wrap the module's named export.
const RawXmlView = lazy(async function () {
    const { RawXmlView: component } = await import('./editor/RawXmlView.tsx');
    return { default: component };
});

// Same on-demand treatment for the activity-detail pane, whose markdown renderer (streamdown and its remark/rehype
// stack) only matters once an activity tab is opened.
const ActivityDetail = lazy(async function () {
    const { ActivityDetail: component } = await import('./activity/ActivityDetail.tsx');
    return { default: component };
});

// Persist the desktop collapse choice so it survives reloads. Defaults to expanded when nothing is stored.
const SIDEBAR_STORAGE_KEY = 'vibrary:sidebar-collapsed';

// Below this width the sidebar is an off-canvas drawer; above it, an inline panel that collapses in place.
const MOBILE_QUERY = '(max-width: 700px)';

const App = function () {
    // Desktop: whether the inline sidebar is collapsed (persisted). Seed from storage so the first paint already
    // matches, avoiding an expand-then-collapse flash. localStorage can throw when blocked, so fall back to expanded.
    const [sidebarCollapsed, setSidebarCollapsed] = useState(function (): boolean {
        try {
            return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
        } catch {
            return false;
        }
    });
    // Mobile: whether the off-canvas drawer is open. Ephemeral and always starts closed, independent of the desktop
    // preference above.
    const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
    // Filter-dropdown visibility and the selected status and entry-type filters for the structured editor. UI-only and
    // shared across tabs, so they live here rather than per-tab; the toolbar Filter button toggles the dropdown and
    // shows a dot badge while any filter is applied.
    const [showFilters, setShowFilters] = useState<boolean>(false);
    const [statusFilter, setStatusFilter] = useState<Option[]>([]);
    const [typeFilter, setTypeFilter] = useState<Option[]>([]);
    const [labelFilter, setLabelFilter] = useState<Option[]>([]);
    // The file + query + match index from a clicked Search result, so the open file's editor can scroll to / highlight
    // the corresponding entry rather than always the first one that matches. Cleared to null once consumed isn't
    // necessary - the editor only acts when it matches the active tab.
    const [searchTarget, setSearchTarget] = useState<{ path: string; query: string; matchIndex: number; exactTitle: boolean } | null>(null);

    const { tabs, activePath, activeTab, anyDirty, closedTabCount, openOrFocus, openActivity, closeTab, closeTabs, reopenClosedTab, setActive, setInnerTab, patchTab } =
        useOpenTabs();
    const { enqueue } = useActivityQueueActions();

    // Open a file from the sidebar (or after creating one): focus its tab if already open, otherwise create one and
    // fetch its content, then close the mobile drawer (the desktop collapse is left untouched).
    const handleOpen = useCallback(function (name: string) {
        openOrFocus(name);
        setDrawerOpen(false);
    }, [openOrFocus]);

    const {
        files, fileSummaries, hasVibraryInclude, titleIndex, loadError, clearLoadError, reportLoadError,
        refreshing, listingLoaded, refreshListing,
        handleRefresh, handleAddFile, handleNewFile, handleCreateInclude,
        handleDelete, handleBulkDelete, handleRename, handleDuplicate
    } = useFileOperations({ tabs, closeTab, openOrFocus, onFileOpened: handleOpen });

    useSessionRestore({ files, listingLoaded, tabs, activePath, openOrFocus, setActive, reportError: reportLoadError });

    const allTitles = titleIndex.map(function (entry) {
        return entry.title;
    });

    // Live tallies use each open, parsed tab's in-memory model; loading tabs fall through to the cached count.
    const openTabsForCounts = tabs
        .filter(function (tab) {
            return !tab.loading;
        })
        .map(function (tab) {
            return { path: tab.path, specs: tab.specs, parseError: tab.parseError };
        });
    const { countForFile, markCounted } = useFileCounts(fileSummaries, openTabsForCounts);

    // Warn before the tab is closed or the page is navigated away while any open tab has unsaved edits. Setting
    // returnValue is what makes the browser show its native "leave site?" confirmation, which lets the user cancel.
    useEffect(function () {
        if (!anyDirty) {
            return undefined;
        }
        const handleBeforeUnload = function (unloadEvent: BeforeUnloadEvent) {
            unloadEvent.preventDefault();
            unloadEvent.returnValue = '';
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return function () {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [anyDirty]);

    // Close tabs from the tab bar or the Open Editors list, confirming first when any of them has unsaved edits -
    // closing is how those edits get discarded, so it should never happen silently. Delete/rename close tabs via
    // closeTab directly, since they run their own confirmations.
    const requestCloseTabs = useCallback(async function (paths: string[]) {
        const closingSet = new Set(paths);
        const dirtyCount = tabs.filter(function (tab) {
            return closingSet.has(tab.path) && tab.dirty;
        }).length;
        if (dirtyCount > 0) {
            const confirmed = await confirmDialog(
                dirtyCount === 1 ?
                    'Close a file with unsaved changes? Its edits will be lost.' :
                    `Close ${dirtyCount} files with unsaved changes? Their edits will be lost.`,
                'Close'
            );
            if (!confirmed) {
                return;
            }
        }
        closeTabs(paths);
    }, [tabs, closeTabs]);

    const handleCloseTab = useCallback(function (path: string) {
        void requestCloseTabs([path]);
    }, [requestCloseTabs]);

    const handleCloseOthers = useCallback(function (path: string) {
        void requestCloseTabs(tabs.filter(function (tab) {
            return tab.path !== path;
        }).map(function (tab) {
            return tab.path;
        }));
    }, [tabs, requestCloseTabs]);

    const handleCloseAll = useCallback(function () {
        void requestCloseTabs(tabs.map(function (tab) {
            return tab.path;
        }));
    }, [tabs, requestCloseTabs]);

    // The toolbar's reload button: re-read the active tab's file from disk, picking up edits made outside the app.
    // Unsaved local edits would be overwritten, so confirm before discarding them.
    const reloadFile = useCallback(async function () {
        if (activeTab === null) {
            return;
        }
        const path = activeTab.path;
        if (activeTab.dirty) {
            const discard = await confirmDialog(
                'Reload from disk? Your unsaved changes will be lost.',
                'Reload'
            );
            if (!discard) {
                return;
            }
        }
        patchTab(path, { reloading: true });
        try {
            // A parse failure arrives in-band (parseError set, content still present) so the Raw tab can show the
            // malformed on-disk file; only a fetch failure lands in the catch, where there is no content to show.
            const { content, specs, schemas, parseError } = await loadVibraryFile(path);
            patchTab(path, {
                specs,
                schemas,
                rawFallback: content,
                parseError,
                dirty: false,
                status: { kind: 'idle' },
                reloading: false,
                reloadNonce: activeTab.reloadNonce + 1
            });
        } catch (error) {
            patchTab(path, { specs: [], schemas: {}, parseError: (error as Error).message, reloading: false });
        }
    }, [activeTab, patchTab]);

    // Raw tab shows the XML regenerated from the structured model (source of truth); on parse failure it shows the
    // original file content so the malformed XML is still visible.
    const rawXml = useMemo(function () {
        if (activeTab === null) {
            return '';
        }
        return activeTab.parseError === null ? serializeVibraryXml(activeTab.specs) : activeTab.rawFallback;
    }, [activeTab]);

    const onSave = useCallback(async function () {
        if (activeTab === null || activeTab.parseError !== null) {
            return;
        }
        const path = activeTab.path;
        const specs = activeTab.specs;
        patchTab(path, { status: { kind: 'saving' } });
        try {
            await saveFile(path, serializeVibraryXml(specs));
            patchTab(path, { status: { kind: 'idle' }, dirty: false });
            markCounted(path, specs);
            // One summary request refreshes the title options and (eventually) the badges; markCounted above covers
            // the badge in the meantime.
            void refreshListing();
        } catch (error) {
            patchTab(path, { status: { kind: 'error', message: (error as Error).message } });
        }
    }, [activeTab, patchTab, markCounted, refreshListing]);

    // App-wide keyboard shortcuts. Ctrl+S / Cmd+S saves the active file, matching every other text editor - PLAIN
    // Ctrl+S only: Ctrl+Shift+S and Ctrl+Alt+S belong to the browser or the user's own tools, and an editor treating
    // them as Save would hijack them for no benefit. The browser's "Save Page As" is prevented even when there is
    // nothing to save; the save guard mirrors the toolbar button's (dirty, not already saving, no parse error) so the
    // shortcut cannot double-save or "succeed" on a broken file. Ctrl+Shift+T / Cmd+Shift+T reopens the last closed
    // tab - the keyboard twin of the toolbar button, and the binding every browser/editor user tries first (the
    // natural companion to the tab strip's middle-click close); default is prevented only when there is something to
    // reopen, so the browser's own reopen-tab stays reachable otherwise.
    useEffect(function () {
        const handleKeyDown = function (event: KeyboardEvent) {
            if (!(event.ctrlKey || event.metaKey)) {
                return;
            }
            const key = event.key.toLowerCase();
            if (event.shiftKey && !event.altKey && key === 't') {
                if (closedTabCount > 0) {
                    event.preventDefault();
                    reopenClosedTab();
                }
                return;
            }
            if (event.shiftKey || event.altKey || key !== 's') {
                return;
            }
            event.preventDefault();
            if (activeTab === null || activeTab.kind !== 'file' || !activeTab.dirty || activeTab.parseError !== null || activeTab.status.kind === 'saving') {
                return;
            }
            void onSave();
        };
        window.addEventListener('keydown', handleKeyDown);
        return function () {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [activeTab, onSave, closedTabCount, reopenClosedTab]);

    // Generate entries of the chosen type with the backend AI agent, then refresh the editor from disk. The agent reads
    // the file from disk, so flush any unsaved edits first; afterwards reload the agent's additions (mirrors reloadFile).
    const handleGenerate = useCallback(async function (type: EntryType, count: number, instructions: string) {
        if (activeTab === null || activeTab.parseError !== null) {
            return;
        }
        const path = activeTab.path;
        if (activeTab.dirty) {
            await saveFile(path, serializeVibraryXml(activeTab.specs));
            patchTab(path, { dirty: false, status: { kind: 'idle' } });
        }
        const promptParts = [`Generate ${count} ${type} ${count === 1 ? 'entry' : 'entries'} in ${path}`];
        if (instructions !== '') {
            promptParts.push('', 'Instructions:', instructions);
        }
        await enqueue({
            kind: 'generate',
            label: `${count} ${type}`,
            prompt: promptParts.join('\n'),
            run: function (signal, onEvent) {
                return generateSpecs(path, type, count, instructions, { signal, onEvent });
            }
        });
        // parseError arrives in-band: if the agent left the file malformed, the tab shows the parse error with the
        // raw content visible instead of pretending the reload produced a clean model.
        const { content, specs, schemas, parseError } = await loadVibraryFile(path);
        patchTab(path, {
            specs,
            schemas,
            rawFallback: content,
            parseError,
            dirty: false,
            status: { kind: 'idle' },
            reloadNonce: activeTab.reloadNonce + 1
        });
        void refreshListing();
    }, [activeTab, enqueue, patchTab, refreshListing]);

    const onSpecsChange = useCallback(function (next: Spec[]) {
        if (activePath === null) {
            return;
        }
        patchTab(activePath, { specs: next, status: { kind: 'idle' }, dirty: true });
    }, [activePath, patchTab]);

    // Set the desktop collapse flag and persist it. localStorage can throw when blocked; the choice still applies for
    // this session.
    const applyCollapsed = useCallback(function (willCollapse: boolean) {
        setSidebarCollapsed(willCollapse);
        try {
            window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(willCollapse));
        } catch {
            // ignore persistence failures; the toggle still works for this session
        }
    }, []);

    // One toggle for both layouts: on mobile it opens/closes the off-canvas drawer; on desktop it collapses/expands
    // the inline panel and persists that choice. The breakpoint is read at click time so render stays flash-free.
    const toggleSidebar = function () {
        if (window.matchMedia(MOBILE_QUERY).matches) {
            setDrawerOpen(function (open) {
                return !open;
            });
            return;
        }
        applyCollapsed(!sidebarCollapsed);
    };

    // Force the panel expanded - the rail calls this when switching to a different view while collapsed, so the new
    // view is visible. A no-op on mobile, where the drawer (not the collapse flag) governs visibility.
    const expandSidebar = useCallback(function () {
        applyCollapsed(false);
    }, [applyCollapsed]);

    // Open the file holding a clicked Search match and remember its query and index among that file's matches, so the
    // editor scrolls to / highlights the corresponding entry (not always the first one that matches) once the tab is
    // active.
    const handleOpenMatch = useCallback(function (name: string, query: string, matchIndex = 0) {
        openOrFocus(name);
        setSearchTarget({ path: name, query, matchIndex, exactTitle: false });
        setDrawerOpen(false);
    }, [openOrFocus]);

    // Open the entry a clicked "Relates to" chip points at: resolve its title to a file via titleIndex, then reuse
    // the open+scroll+highlight mechanism with EXACT-title matching - a substring match would let an earlier entry
    // that merely MENTIONS the title (which related entries do by definition) win over the entry bearing it. A stale
    // reference (the target renamed or removed since the chip was set) gets a toast instead of a silent dead click.
    const handleOpenRelated = useCallback(function (title: string) {
        const entry = titleIndex.find(function (candidate) {
            return candidate.title === title;
        });
        if (entry === undefined) {
            toast(`No entry titled "${title}" found - it may have been renamed or removed.`);
            return;
        }
        openOrFocus(entry.path);
        setSearchTarget({ path: entry.path, query: title, matchIndex: 0, exactTitle: true });
        setDrawerOpen(false);
    }, [titleIndex, openOrFocus]);

    // The open tabs in tab-bar shape, shared by the editor's TabBar and the Explorer's "Open Editors" list so the two
    // stay in sync. Activity tabs carry the job's title; file tabs fall back to their basename in the consumer.
    const openTabInfos = tabs.map(function (tab) {
        return { path: tab.path, dirty: tab.dirty, label: tab.kind === 'activity' ? tab.title : undefined };
    });

    return (
        <div className={styles.layout}>
            <LeftPanel
                files={files}
                hasVibraryInclude={hasVibraryInclude}
                selected={activePath}
                open={drawerOpen}
                isCollapsed={sidebarCollapsed}
                onToggleCollapse={toggleSidebar}
                onExpand={expandSidebar}
                refreshing={refreshing}
                countForFile={countForFile}
                openTabs={openTabInfos}
                onOpen={handleOpen}
                onClose={function () {
                    setDrawerOpen(false);
                }}
                onRefresh={handleRefresh}
                onAddFile={handleAddFile}
                onCreateInclude={handleCreateInclude}
                onDelete={handleDelete}
                onRename={handleRename}
                onDuplicate={handleDuplicate}
                onNewFile={handleNewFile}
                onBulkDelete={handleBulkDelete}
                onSelectTab={setActive}
                onCloseTab={handleCloseTab}
                onOpenActivity={openActivity}
                onOpenMatch={handleOpenMatch}
            />

            <main className={styles.editor}>
                <header className={styles.editorHead}>
                    <button
                        type="button"
                        className={styles.menuToggle}
                        aria-label="Toggle file list"
                        onClick={toggleSidebar}
                    >
                        <MenuIcon />
                    </button>
                    {tabs.length > 0 && activePath !== null &&
                    <TabBar
                        tabs={openTabInfos}
                        activePath={activePath}
                        onSelect={setActive}
                        onClose={handleCloseTab}
                        onCloseOthers={handleCloseOthers}
                        onCloseAll={handleCloseAll}
                    />}
                    <button
                        type="button"
                        className={styles.reopenClosed}
                        aria-label="Reopen last closed tab"
                        title={closedTabCount === 0 ? 'No recently closed tabs' : 'Reopen last closed tab'}
                        onClick={reopenClosedTab}
                        disabled={closedTabCount === 0}
                    >
                        <RefreshIcon />
                    </button>
                </header>

                {loadError !== null &&
                <div className={styles.loadError} role="alert">
                    <span className={styles.loadErrorText}>{loadError}</span>
                    <button
                        type="button"
                        className={styles.loadErrorDismiss}
                        aria-label="Dismiss error"
                        title="Dismiss"
                        onClick={clearLoadError}
                    >
                        <CloseIcon />
                    </button>
                </div>}

                {activeTab === null && <p className={styles.placeholder}>Select a file to edit.</p>}

                {activeTab !== null && activeTab.kind === 'activity' &&
                <Suspense fallback={null}>
                    {/* Keyed by job so switching straight between two activity tabs remounts the detail: its composer
                        draft is seeded from the provider only at mount, and an unkeyed instance would carry tab A's
                        half-typed draft (and elapsed-timer/scroll state) over to tab B - and then mirror that draft
                        into B's stored one. The editor below gets the same treatment via its own key. */}
                    <ActivityDetail key={activeTab.jobId} jobId={activeTab.jobId ?? ''} />
                </Suspense>}

                {activeTab !== null && activeTab.kind === 'file' &&
                (activeTab.loading ?
                    (
                        <p className={styles.placeholder}>Loading...</p>
                    ) :
                    (
                        <>
                            <div className={styles.toolbar}>
                                <div className={styles.toolbarActions}>
                                    <button
                                        type="button"
                                        className={cx(styles.reload, activeTab.reloading && styles.reloading)}
                                        aria-label="Reload from disk"
                                        title="Reload from disk"
                                        onClick={reloadFile}
                                        disabled={activeTab.reloading}
                                    >
                                        <RefreshIcon />
                                    </button>
                                    <button
                                        type="button"
                                        className={styles.save}
                                        title={activeTab.dirty ? 'Save (Ctrl+S)' : 'Saved'}
                                        onClick={onSave}
                                        disabled={activeTab.status.kind === 'saving' || !activeTab.dirty || activeTab.parseError !== null}
                                    >
                                        {activeTab.status.kind === 'saving' ?
                                            <span className={styles.spinner} role="status" aria-label="Saving" /> :
                                            (
                                                <>
                                                    <SaveIcon />
                                                    {activeTab.dirty ? 'Save' : 'Saved'}
                                                </>
                                            )}
                                    </button>
                                </div>
                                <div className={styles.tabs}>
                                    {activeTab.innerTab === 'structured' && activeTab.specs.length > 0 &&
                                    <button
                                        type="button"
                                        className={cx(showFilters && styles.active)}
                                        aria-label="Filter entries by approval status"
                                        aria-expanded={showFilters}
                                        onClick={function () {
                                            setShowFilters(function (previous) {
                                                return !previous;
                                            });
                                        }}
                                    >
                                        <span className={styles.filterIconWrap}>
                                            <FilterIcon />
                                            {(statusFilter.length > 0 || typeFilter.length > 0 || labelFilter.length > 0) && <span className={styles.filterDot} />}
                                        </span>
                                        <span className={styles.tabText}>Filter</span>
                                    </button>}
                                    <button
                                        type="button"
                                        className={cx(activeTab.innerTab === 'structured' && styles.active)}
                                        onClick={function () {
                                            setInnerTab(activeTab.path, 'structured');
                                        }}
                                    >
                                        <ListIcon />
                                        <span className={styles.tabText}>Structured</span>
                                    </button>
                                    <button
                                        type="button"
                                        className={cx(activeTab.innerTab === 'raw' && styles.active)}
                                        onClick={function () {
                                            setInnerTab(activeTab.path, 'raw');
                                        }}
                                    >
                                        <CodeIcon />
                                        <span className={styles.tabText}>Raw</span>
                                    </button>
                                </div>
                                {activeTab.status.kind === 'error' && <span className={styles.err}>{activeTab.status.message}</span>}
                            </div>

                            {activeTab.parseError !== null &&
                            <p className={cx(styles.err, styles.parseError)}>Could not parse XML: {activeTab.parseError}. Fix the file, then reopen it.</p>}

                            {activeTab.innerTab === 'structured' && activeTab.parseError === null ?
                                (
                                    <SpecsEditor
                                        key={`${activeTab.path}:${activeTab.reloadNonce}`}
                                        defaultEntryType={entryTypeFromName(activeTab.path)}
                                        specs={activeTab.specs}
                                        schemas={activeTab.schemas}
                                        allTitles={allTitles}
                                        highlightQuery={searchTarget !== null && searchTarget.path === activeTab.path ? searchTarget.query : undefined}
                                        highlightMatchIndex={searchTarget !== null && searchTarget.path === activeTab.path ? searchTarget.matchIndex : 0}
                                        highlightExactTitle={searchTarget !== null && searchTarget.path === activeTab.path && searchTarget.exactTitle}
                                        onChange={onSpecsChange}
                                        onGenerate={handleGenerate}
                                        onOpenRelated={handleOpenRelated}
                                        showFilters={showFilters}
                                        statusFilter={statusFilter}
                                        onStatusFilterChange={setStatusFilter}
                                        typeFilter={typeFilter}
                                        onTypeFilterChange={setTypeFilter}
                                        labelFilter={labelFilter}
                                        onLabelFilterChange={setLabelFilter}
                                    />
                                ) :
                                (
                                    // The fallback stays empty: the chunk loads once, near-instantly from the local
                                    // server, so a spinner would only flash.
                                    <Suspense fallback={null}>
                                        <RawXmlView xml={rawXml} />
                                    </Suspense>
                                )}
                        </>
                    ))}
            </main>
        </div>
    );
};

export { App };
