import cx from 'classnames';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';

import { useActivityQueue } from './activityQueue.ts';
import { createFile, deleteFile, duplicateFile, generateSpecs, getWorkspace, listFiles, loadTitleIndex, renameFile, saveFile, type TitleIndexEntry } from './api.ts';
import { CodeIcon, FilterIcon, ListIcon, MenuIcon, RefreshIcon, SaveIcon } from './components/Icons.tsx';
import { LeftPanel } from './components/LeftPanel.tsx';
import { collectFilePaths, type TreeNode } from './fileTree.ts';
import { TabBar } from './components/TabBar.tsx';
import { SpecsEditor, type Option } from './components/SpecsEditor.tsx';
import { confirmDialog } from './confirmDialog.ts';
import { promptDialog } from './promptDialog.ts';
import { loadVibraryFile } from './loadVibraryFile.ts';
import { readSessionTabs, writeSessionTabs } from './sessionTabs.ts';
import { type EntryType, entryTypeFromName, serializeVibraryXml, type Spec } from './vibraryXml.ts';
import { useFileCounts } from './useFileCounts.ts';
import { useOpenTabs } from './useOpenTabs.ts';

import styles from './App.module.css';

// Load the Raw tab's syntax highlighter on demand: prism/refractor is a sizeable chunk that most sessions (which stay
// on the Structured tab) never need. lazy() wants a default export, so wrap the module's named export.
const RawXmlView = lazy(async function () {
    const { RawXmlView: component } = await import('./components/RawXmlView.tsx');
    return { default: component };
});

// Same on-demand treatment for the activity-detail pane, whose markdown renderer (streamdown and its remark/rehype
// stack) only matters once an activity tab is opened.
const ActivityDetail = lazy(async function () {
    const { ActivityDetail: component } = await import('./components/ActivityDetail.tsx');
    return { default: component };
});

// Persist the desktop collapse choice so it survives reloads. Defaults to expanded when nothing is stored.
const SIDEBAR_STORAGE_KEY = 'vibrary:sidebar-collapsed';

// Below this width the sidebar is an off-canvas drawer; above it, an inline panel that collapses in place.
const MOBILE_QUERY = '(max-width: 700px)';

const App = function () {
    const [files, setFiles] = useState<string[]>([]);
    // Whether a ".vibraryinclude" file exists at all, so the explorer's empty state can tell "nothing included yet
    // because no .vibraryinclude exists" apart from "a .vibraryinclude exists but its patterns match nothing".
    const [hasVibraryInclude, setHasVibraryInclude] = useState(true);
    // Every entry title across every vibrary file, paired with which file it lives in - backs both the "Relates to"
    // option list (title only, see allTitles below) and resolving a clicked "Relates to" chip to its target file.
    const [titleIndex, setTitleIndex] = useState<TitleIndexEntry[]>([]);
    const allTitles = titleIndex.map(function (entry) {
        return entry.title;
    });
    // Errors from loading the file list or titles (not tied to any one open tab), shown as a banner above the editor.
    const [loadError, setLoadError] = useState<string | null>(null);
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
    const [refreshing, setRefreshing] = useState<boolean>(false);
    // Filter-dropdown visibility and the selected status and entry-type filters for the structured editor. UI-only and
    // shared across tabs, so they live here rather than per-tab; the toolbar Filter button toggles the dropdown and
    // shows a dot badge while any filter is applied.
    const [showFilters, setShowFilters] = useState<boolean>(false);
    const [statusFilter, setStatusFilter] = useState<Option[]>([]);
    const [typeFilter, setTypeFilter] = useState<Option[]>([]);
    const [labelFilter, setLabelFilter] = useState<Option[]>([]);
    // The served folder, used to scope which tabs are remembered across reloads. sessionReady gates persistence until
    // the one-time restore has run, so the initial empty tab list never overwrites a stored session.
    const [workspaceCwd, setWorkspaceCwd] = useState<string | null>(null);
    const [sessionReady, setSessionReady] = useState<boolean>(false);
    // The file + query + match index from a clicked Search result, so the open file's editor can scroll to / highlight
    // the corresponding entry rather than always the first one that matches. Cleared to null once consumed isn't
    // necessary - the editor only acts when it matches the active tab.
    const [searchTarget, setSearchTarget] = useState<{ path: string; query: string; matchIndex: number } | null>(null);

    const { tabs, activePath, activeTab, anyDirty, closedTabCount, openOrFocus, openActivity, closeTab, closeTabs, reopenClosedTab, setActive, setInnerTab, patchTab } =
        useOpenTabs();
    const { enqueue } = useActivityQueue();

    // Live tallies use each open, parsed tab's in-memory model; loading tabs fall through to the cached count.
    const openTabsForCounts = tabs
        .filter(function (tab) {
            return !tab.loading;
        })
        .map(function (tab) {
            return { path: tab.path, specs: tab.specs, parseError: tab.parseError };
        });
    const { countForFile, markCounted } = useFileCounts(files, openTabsForCounts);

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

    useEffect(function () {
        const loadAsync = async function () {
            try {
                const [loadedListing, cwd] = await Promise.all([listFiles(), getWorkspace()]);
                setFiles(loadedListing.files);
                setHasVibraryInclude(loadedListing.hasVibraryInclude);
                setWorkspaceCwd(cwd);
                // Reopen the folder's previously open tabs, skipping any that no longer exist (deleted, or stored under
                // a folder that happens to share this one's key). openOrFocus fetches each tab's content on its own.
                const record = readSessionTabs(cwd);
                if (record !== null) {
                    const present = new Set(loadedListing.files);
                    const toRestore = record.paths.filter(function (path) { return present.has(path); });
                    for (const path of toRestore) {
                        openOrFocus(path);
                    }
                    if (record.activePath !== null && present.has(record.activePath)) {
                        setActive(record.activePath);
                    }
                }
                setSessionReady(true);
                setTitleIndex(await loadTitleIndex());
            } catch (error) {
                setLoadError((error as Error).message);
            }
        };
        void loadAsync();
    }, [openOrFocus, setActive]);

    // Persist the open set and active tab whenever they change, so a reload can restore them. The effect keys on a
    // signature of just the open paths, so per-tab edits (dirty/status/reloadNonce) that rebuild the tabs array do not
    // trigger redundant writes. Closing the last tab stores an empty set, which correctly restores to an empty editor.
    // Only file tabs are persisted; activity tabs are in-memory (their job lives in the queue, lost on refresh).
    const openSignature = tabs.filter(function (tab) { return tab.kind === 'file'; }).map(function (tab) { return tab.path; }).join('\n');
    useEffect(function () {
        if (!sessionReady || workspaceCwd === null) {
            return;
        }
        const paths = openSignature === '' ? [] : openSignature.split('\n');
        const persistedActive = activePath !== null && paths.includes(activePath) ? activePath : null;
        writeSessionTabs(workspaceCwd, { paths, activePath: persistedActive });
    }, [openSignature, activePath, sessionReady, workspaceCwd]);

    // The sidebar's refresh button: reload the file list and every spec title from disk, picking up files added or
    // changed outside the app. Counts refresh on their own, since useFileCounts reloads whenever the files array
    // changes identity, which setFiles does.
    const handleRefresh = useCallback(async function () {
        setRefreshing(true);
        try {
            const listing = await listFiles();
            setFiles(listing.files);
            setHasVibraryInclude(listing.hasVibraryInclude);
            setTitleIndex(await loadTitleIndex());
            setLoadError(null);
        } catch (error) {
            setLoadError((error as Error).message);
        } finally {
            setRefreshing(false);
        }
    }, []);

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

    // Open a file from the sidebar: focus its tab if already open, otherwise create one and fetch its content, then
    // close the mobile drawer (the desktop collapse is left untouched).
    const handleOpen = useCallback(function (name: string) {
        openOrFocus(name);
        setDrawerOpen(false);
    }, [openOrFocus]);

    // The sidebar's add button: prompt for a name, create the empty file on the server, then refresh the list and open
    // it. The name must match the vibrary naming convention (<family>.xml or <family>-<name>.xml, where family is
    // reviews/specs/tasks/ideas); the server validates and surfaces any problem (bad name, already exists) as the
    // load-error banner.
    const handleAddFile = useCallback(async function () {
        const name = await promptDialog({
            message: 'New file name (e.g. specs.xml, reviews-<name>.xml, tasks-<name>.xml, ideas-<name>.xml):',
            placeholder: 'specs-<name>.xml',
            confirmLabel: 'Create'
        });
        if (name === null) {
            return;
        }
        try {
            await createFile(name);
            const listing = await listFiles();
            setFiles(listing.files);
            setHasVibraryInclude(listing.hasVibraryInclude);
            setLoadError(null);
            openOrFocus(name);
            setDrawerOpen(false);
        } catch (error) {
            setLoadError((error as Error).message);
        }
    }, [openOrFocus]);

    // The explorer "More" menu's Delete action. Folders have no on-disk entity (they are derived from file paths), so
    // deleting one removes every file beneath it; a file deletes just itself. Warn before the irreversible delete, then
    // remove the files, close any open tabs for them, and refresh the list and title pool.
    const handleDelete = useCallback(async function (node: TreeNode) {
        const paths = collectFilePaths(node);
        const target = node.kind === 'folder' ?
            `folder "${node.path}" and its ${paths.length} file${paths.length === 1 ? '' : 's'}` :
            `"${node.path}"`;
        const confirmed = await confirmDialog(`Delete ${target}? This cannot be undone.`, 'Delete');
        if (!confirmed) {
            return;
        }
        try {
            for (const path of paths) {
                await deleteFile(path);
                closeTab(path);
            }
            const listing = await listFiles();
            setFiles(listing.files);
            setHasVibraryInclude(listing.hasVibraryInclude);
            setTitleIndex(await loadTitleIndex());
            setLoadError(null);
        } catch (error) {
            setLoadError((error as Error).message);
        }
    }, [closeTab]);

    // The Explorer's bulk-select footer Delete button: same warn-then-delete-then-refresh shape as handleDelete above,
    // but over an arbitrary multi-file selection instead of one node's subtree. Resolves whether the user confirmed, so
    // the sidebar knows whether to clear its selection (kept intact on cancel).
    const handleBulkDelete = useCallback(async function (paths: string[]): Promise<boolean> {
        if (paths.length === 0) {
            return false;
        }
        const confirmed = await confirmDialog(`Delete ${paths.length} file${paths.length === 1 ? '' : 's'}? This cannot be undone.`, 'Delete');
        if (!confirmed) {
            return false;
        }
        try {
            for (const path of paths) {
                await deleteFile(path);
                closeTab(path);
            }
            const listing = await listFiles();
            setFiles(listing.files);
            setHasVibraryInclude(listing.hasVibraryInclude);
            setTitleIndex(await loadTitleIndex());
            setLoadError(null);
        } catch (error) {
            setLoadError((error as Error).message);
        }
        return true;
    }, [closeTab]);

    // The explorer "More" menu's Rename action. A file renames (or moves - the new name may point into another folder)
    // just itself; a folder renames every file beneath it, since folders have no on-disk entity of their own. Open tabs
    // are keyed by path, so affected tabs are closed and the file reopened under its new name - which drops unsaved
    // edits, hence the extra confirmation when any affected tab is dirty.
    const handleRename = useCallback(async function (node: TreeNode) {
        const isFolder = node.kind === 'folder';
        const entered = await promptDialog({
            message: isFolder ? `Rename folder "${node.path}" to:` : `Rename "${node.path}" to:`,
            confirmLabel: 'Rename',
            initialValue: node.path
        });
        if (entered === null || entered === node.path) {
            return;
        }
        const renames = isFolder ?
            collectFilePaths(node).map(function (path) {
                return { from: path, to: `${entered}${path.slice(node.path.length)}` };
            }) :
            [{ from: node.path, to: entered }];
        const anyDirtyAffected = renames.some(function ({ from }) {
            return tabs.some(function (tab) {
                return tab.path === from && tab.dirty;
            });
        });
        if (anyDirtyAffected) {
            const confirmed = await confirmDialog('Renaming reopens the file from disk, so its unsaved changes will be lost. Continue?', 'Rename');
            if (!confirmed) {
                return;
            }
        }
        try {
            for (const { from, to } of renames) {
                await renameFile(from, to);
                closeTab(from);
            }
            const listing = await listFiles();
            setFiles(listing.files);
            setHasVibraryInclude(listing.hasVibraryInclude);
            setTitleIndex(await loadTitleIndex());
            setLoadError(null);
            if (!isFolder) {
                openOrFocus(entered);
            }
        } catch (error) {
            setLoadError((error as Error).message);
        }
    }, [tabs, closeTab, openOrFocus]);

    // The explorer "More" menu's Duplicate action: copy a file's on-disk content under a new name, leaving the source
    // untouched, then open the copy. Files only - folders have no single on-disk entity to copy (unlike rename/delete,
    // which recurse over every file beneath a folder).
    const handleDuplicate = useCallback(async function (node: TreeNode) {
        const entered = await promptDialog({
            message: `Duplicate "${node.path}" as:`,
            confirmLabel: 'Duplicate',
            initialValue: node.path
        });
        if (entered === null || entered === node.path) {
            return;
        }
        try {
            await duplicateFile(node.path, entered);
            const listing = await listFiles();
            setFiles(listing.files);
            setHasVibraryInclude(listing.hasVibraryInclude);
            setTitleIndex(await loadTitleIndex());
            setLoadError(null);
            openOrFocus(entered);
        } catch (error) {
            setLoadError((error as Error).message);
        }
    }, [openOrFocus]);

    // The explorer "More" menu's New File action on a folder: prompt for a name and create it inside that folder. The
    // entered name is the file's basename (or a deeper relative path); it is joined onto the folder path before the
    // server validates the vibrary naming convention, mirroring handleAddFile.
    const handleNewFile = useCallback(async function (folderPath: string) {
        const name = await promptDialog({
            message: `New file in "${folderPath}" (e.g. specs.xml, reviews-<name>.xml, tasks-<name>.xml, ideas-<name>.xml):`,
            placeholder: 'specs-<name>.xml',
            confirmLabel: 'Create'
        });
        if (name === null) {
            return;
        }
        const fullName = `${folderPath}/${name}`;
        try {
            await createFile(fullName);
            const listing = await listFiles();
            setFiles(listing.files);
            setHasVibraryInclude(listing.hasVibraryInclude);
            setLoadError(null);
            openOrFocus(fullName);
            setDrawerOpen(false);
        } catch (error) {
            setLoadError((error as Error).message);
        }
    }, [openOrFocus]);

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
            const { content, specs, schemas } = await loadVibraryFile(path);
            patchTab(path, {
                specs,
                schemas,
                rawFallback: content,
                parseError: null,
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
            setTitleIndex(await loadTitleIndex());
        } catch (error) {
            patchTab(path, { status: { kind: 'error', message: (error as Error).message } });
        }
    }, [activeTab, patchTab, markCounted]);

    // Ctrl+S / Cmd+S saves the active file, matching every other text editor. Prevents the browser's own "Save Page
    // As" first, so it never fires even when there is nothing to save. Mirrors the toolbar Save button's own guard
    // (dirty, not already saving, no parse error) so the shortcut cannot double-save or "succeed" on a broken file.
    useEffect(function () {
        const handleKeyDown = function (event: KeyboardEvent) {
            if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') {
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
    }, [activeTab, onSave]);

    // Generate entries of the chosen type with the backend AI agent, then refresh the editor from disk. The agent reads
    // the file from disk, so flush any unsaved edits first; afterwards reload the agent's additions (mirrors reloadFile).
    const handleGenerate = useCallback(async function (type: EntryType, count: number) {
        if (activeTab === null || activeTab.parseError !== null) {
            return;
        }
        const path = activeTab.path;
        if (activeTab.dirty) {
            await saveFile(path, serializeVibraryXml(activeTab.specs));
            patchTab(path, { dirty: false, status: { kind: 'idle' } });
        }
        const claudeOutput = await enqueue({
            kind: 'generate',
            label: `${count} ${type}`,
            prompt: `Generate ${count} ${type} ${count === 1 ? 'entry' : 'entries'} in ${path}`,
            run: function (signal, onEvent) {
                return generateSpecs(path, type, count, { signal, onEvent });
            }
        });
        // Surface the agent's raw output for debugging the generation run.
        console.log(`[vibrary] claude -p output for ${path}:\n${claudeOutput}`);
        const { content, specs, schemas } = await loadVibraryFile(path);
        patchTab(path, {
            specs,
            schemas,
            rawFallback: content,
            parseError: null,
            dirty: false,
            status: { kind: 'idle' },
            reloadNonce: activeTab.reloadNonce + 1
        });
        setTitleIndex(await loadTitleIndex());
    }, [activeTab, enqueue, patchTab]);

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
        setSearchTarget({ path: name, query, matchIndex });
        setDrawerOpen(false);
    }, [openOrFocus]);

    // Open the entry a clicked "Relates to" chip points at: resolve its title to a file via titleIndex, then reuse the
    // same open+scroll+highlight mechanism as a clicked Search result (its title is unique enough that the first match
    // is always the right one). A silent no-op for a stale reference (the target entry was renamed or removed since the
    // "Relates to" was set) - there is nothing sensible to navigate to.
    const handleOpenRelated = useCallback(function (title: string) {
        const entry = titleIndex.find(function (candidate) {
            return candidate.title === title;
        });
        if (entry === undefined) {
            return;
        }
        handleOpenMatch(entry.path, title);
    }, [titleIndex, handleOpenMatch]);

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

                {loadError !== null && <p className={cx(styles.err, styles.parseError)}>{loadError}</p>}

                {activeTab === null && <p className={styles.placeholder}>Select a file to edit.</p>}

                {activeTab !== null && activeTab.kind === 'activity' &&
                <Suspense fallback={null}>
                    <ActivityDetail jobId={activeTab.jobId ?? ''} />
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
                                        aria-label="Filter specs by approval status"
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
