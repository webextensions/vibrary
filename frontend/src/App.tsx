import cx from 'classnames';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { createFile, deleteFile, generateTruths, getFile, getWorkspace, listFiles, loadAllTruthTitles, saveFile } from './api.ts';
import { CodeIcon, FilterIcon, ListIcon, MenuIcon, RefreshIcon, SaveIcon } from './components/Icons.tsx';
import { RawXmlView } from './components/RawXmlView.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { collectFilePaths, type TreeNode } from './fileTree.ts';
import { TabBar } from './components/TabBar.tsx';
import { TruthsEditor, type Option } from './components/TruthsEditor.tsx';
import { confirmDialog } from './confirmDialog.ts';
import { promptDialog } from './promptDialog.ts';
import { readSessionTabs, writeSessionTabs } from './sessionTabs.ts';
import { parseTruthsXml, serializeTruthsXml, type Truth } from './truthsXml.ts';
import { useFileCounts } from './useFileCounts.ts';
import { useOpenTabs } from './useOpenTabs.ts';

import styles from './App.module.css';

// Persist the desktop collapse choice so it survives reloads. Defaults to expanded when nothing is stored.
const SIDEBAR_STORAGE_KEY = 'truths:sidebar-collapsed';

// Below this width the sidebar is an off-canvas drawer; above it, an inline panel that collapses in place.
const MOBILE_QUERY = '(max-width: 700px)';

const App = function () {
    const [files, setFiles] = useState<string[]>([]);
    const [allTitles, setAllTitles] = useState<string[]>([]);
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
    // Filter-dropdown visibility and the selected status filters for the structured editor. UI-only and shared across
    // tabs, so they live here rather than per-tab; the toolbar Filter button toggles the dropdown and shows a dot badge
    // while any filter is applied.
    const [showFilters, setShowFilters] = useState<boolean>(false);
    const [statusFilter, setStatusFilter] = useState<Option[]>([]);
    // The served folder, used to scope which tabs are remembered across reloads. sessionReady gates persistence until
    // the one-time restore has run, so the initial empty tab list never overwrites a stored session.
    const [workspaceCwd, setWorkspaceCwd] = useState<string | null>(null);
    const [sessionReady, setSessionReady] = useState<boolean>(false);

    const { tabs, activePath, activeTab, anyDirty, openOrFocus, closeTab, setActive, setInnerTab, patchTab } =
        useOpenTabs();

    // Live tallies use each open, parsed tab's in-memory model; loading tabs fall through to the cached count.
    const openTabsForCounts = tabs
        .filter(function (tab) {
            return !tab.loading;
        })
        .map(function (tab) {
            return { path: tab.path, truths: tab.truths, parseError: tab.parseError };
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
                const [loadedFiles, cwd] = await Promise.all([listFiles(), getWorkspace()]);
                setFiles(loadedFiles);
                setWorkspaceCwd(cwd);
                // Reopen the folder's previously open tabs, skipping any that no longer exist (deleted, or stored under
                // a folder that happens to share this one's key). openOrFocus fetches each tab's content on its own.
                const record = readSessionTabs(cwd);
                if (record !== null) {
                    const present = new Set(loadedFiles);
                    const toRestore = record.paths.filter(function (path) { return present.has(path); });
                    for (const path of toRestore) {
                        openOrFocus(path);
                    }
                    if (record.activePath !== null && present.has(record.activePath)) {
                        setActive(record.activePath);
                    }
                }
                setSessionReady(true);
                setAllTitles(await loadAllTruthTitles());
            } catch (error) {
                setLoadError((error as Error).message);
            }
        };
        void loadAsync();
    }, [openOrFocus, setActive]);

    // Persist the open set and active tab whenever they change, so a reload can restore them. The effect keys on a
    // signature of just the open paths, so per-tab edits (dirty/status/reloadNonce) that rebuild the tabs array do not
    // trigger redundant writes. Closing the last tab stores an empty set, which correctly restores to an empty editor.
    const openSignature = tabs.map(function (tab) { return tab.path; }).join('\n');
    useEffect(function () {
        if (!sessionReady || workspaceCwd === null) {
            return;
        }
        const paths = openSignature === '' ? [] : openSignature.split('\n');
        writeSessionTabs(workspaceCwd, { paths, activePath });
    }, [openSignature, activePath, sessionReady, workspaceCwd]);

    // The sidebar's refresh button: reload the file list and every truth title from disk, picking up files added or
    // changed outside the app. Counts refresh on their own, since useFileCounts reloads whenever the files array
    // changes identity, which setFiles does.
    const handleRefresh = useCallback(async function () {
        setRefreshing(true);
        try {
            setFiles(await listFiles());
            setAllTitles(await loadAllTruthTitles());
            setLoadError(null);
        } catch (error) {
            setLoadError((error as Error).message);
        } finally {
            setRefreshing(false);
        }
    }, []);

    // Open a file from the sidebar: focus its tab if already open, otherwise create one and fetch its content, then
    // close the mobile drawer (the desktop collapse is left untouched).
    const handleOpen = useCallback(function (name: string) {
        openOrFocus(name);
        setDrawerOpen(false);
    }, [openOrFocus]);

    // The sidebar's add button: prompt for a name, create the empty file on the server, then refresh the list and open
    // it. The name must match the truths naming convention (truths.xml or truths-*.xml); the server validates and
    // surfaces any problem (bad name, already exists) as the load-error banner.
    const handleAddFile = useCallback(async function () {
        const name = await promptDialog({
            message: 'New file name (truths.xml or truths-<name>.xml):',
            placeholder: 'truths-<name>.xml',
            confirmLabel: 'Create'
        });
        if (name === null) {
            return;
        }
        try {
            await createFile(name);
            setFiles(await listFiles());
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
            setFiles(await listFiles());
            setAllTitles(await loadAllTruthTitles());
            setLoadError(null);
        } catch (error) {
            setLoadError((error as Error).message);
        }
    }, [closeTab]);

    // The explorer "More" menu's New File action on a folder: prompt for a name and create it inside that folder. The
    // entered name is the file's basename (or a deeper relative path); it is joined onto the folder path before the
    // server validates the truths naming convention, mirroring handleAddFile.
    const handleNewFile = useCallback(async function (folderPath: string) {
        const name = await promptDialog({
            message: `New file in "${folderPath}" (truths.xml or truths-<name>.xml):`,
            placeholder: 'truths-<name>.xml',
            confirmLabel: 'Create'
        });
        if (name === null) {
            return;
        }
        const fullName = `${folderPath}/${name}`;
        try {
            await createFile(fullName);
            setFiles(await listFiles());
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
            const content = await getFile(path);
            patchTab(path, {
                truths: parseTruthsXml(content),
                rawFallback: content,
                parseError: null,
                dirty: false,
                status: { kind: 'idle' },
                reloading: false,
                reloadNonce: activeTab.reloadNonce + 1
            });
        } catch (error) {
            patchTab(path, { truths: [], parseError: (error as Error).message, reloading: false });
        }
    }, [activeTab, patchTab]);

    // Raw tab shows the XML regenerated from the structured model (source of truth); on parse failure it shows the
    // original file content so the malformed XML is still visible.
    const rawXml = useMemo(function () {
        if (activeTab === null) {
            return '';
        }
        return activeTab.parseError === null ? serializeTruthsXml(activeTab.truths) : activeTab.rawFallback;
    }, [activeTab]);

    const onSave = useCallback(async function () {
        if (activeTab === null || activeTab.parseError !== null) {
            return;
        }
        const path = activeTab.path;
        const truths = activeTab.truths;
        patchTab(path, { status: { kind: 'saving' } });
        try {
            await saveFile(path, serializeTruthsXml(truths));
            patchTab(path, { status: { kind: 'idle' }, dirty: false });
            markCounted(path, truths);
            setAllTitles(await loadAllTruthTitles());
        } catch (error) {
            patchTab(path, { status: { kind: 'error', message: (error as Error).message } });
        }
    }, [activeTab, patchTab, markCounted]);

    // Generate truths with the backend AI agent, then refresh the editor from disk. The agent reads the file from disk,
    // so flush any unsaved edits first; afterwards reload the agent's additions (mirrors reloadFile's tab patch).
    const handleGenerate = useCallback(async function (count: number) {
        if (activeTab === null || activeTab.parseError !== null) {
            return;
        }
        const path = activeTab.path;
        if (activeTab.dirty) {
            await saveFile(path, serializeTruthsXml(activeTab.truths));
            patchTab(path, { dirty: false, status: { kind: 'idle' } });
        }
        const claudeOutput = await generateTruths(path, count);
        // Surface the agent's raw output for debugging the generation run.
        console.log(`[truths] claude -p output for ${path}:\n${claudeOutput}`);
        const content = await getFile(path);
        patchTab(path, {
            truths: parseTruthsXml(content),
            rawFallback: content,
            parseError: null,
            dirty: false,
            status: { kind: 'idle' },
            reloadNonce: activeTab.reloadNonce + 1
        });
        setAllTitles(await loadAllTruthTitles());
    }, [activeTab, patchTab]);

    const onTruthsChange = useCallback(function (next: Truth[]) {
        if (activePath === null) {
            return;
        }
        patchTab(activePath, { truths: next, status: { kind: 'idle' }, dirty: true });
    }, [activePath, patchTab]);

    // One toggle for both layouts: on mobile it opens/closes the off-canvas drawer; on desktop it collapses/expands
    // the inline sidebar and persists that choice. The breakpoint is read at click time so render stays flash-free.
    const toggleSidebar = function () {
        if (window.matchMedia(MOBILE_QUERY).matches) {
            setDrawerOpen(function (open) {
                return !open;
            });
            return;
        }
        const willCollapse = !sidebarCollapsed;
        setSidebarCollapsed(willCollapse);
        try {
            window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(willCollapse));
        } catch {
            // ignore persistence failures; the toggle still works for this session
        }
    };

    return (
        <div className={styles.layout}>
            <Sidebar
                files={files}
                selected={activePath}
                open={drawerOpen}
                isCollapsed={sidebarCollapsed}
                refreshing={refreshing}
                countForFile={countForFile}
                onOpen={handleOpen}
                onClose={function () {
                    setDrawerOpen(false);
                }}
                onRefresh={handleRefresh}
                onAddFile={handleAddFile}
                onDelete={handleDelete}
                onNewFile={handleNewFile}
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
                        tabs={tabs.map(function (tab) {
                            return { path: tab.path, dirty: tab.dirty };
                        })}
                        activePath={activePath}
                        onSelect={setActive}
                        onClose={closeTab}
                    />}
                </header>

                {loadError !== null && <p className={cx(styles.err, styles.parseError)}>{loadError}</p>}

                {activeTab === null ?
                    (
                        <p className={styles.placeholder}>Select a file to edit.</p>
                    ) :
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
                                        {activeTab.innerTab === 'structured' && activeTab.truths.length > 0 &&
                                        <button
                                            type="button"
                                            className={cx(showFilters && styles.active)}
                                            aria-label="Filter truths by approval status"
                                            aria-expanded={showFilters}
                                            onClick={function () {
                                                setShowFilters(function (previous) {
                                                    return !previous;
                                                });
                                            }}
                                        >
                                            <span className={styles.filterIconWrap}>
                                                <FilterIcon />
                                                {statusFilter.length > 0 && <span className={styles.filterDot} />}
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
                                        <TruthsEditor
                                            key={`${activeTab.path}:${activeTab.reloadNonce}`}
                                            truths={activeTab.truths}
                                            allTitles={allTitles}
                                            onChange={onTruthsChange}
                                            onGenerate={handleGenerate}
                                            showFilters={showFilters}
                                            statusFilter={statusFilter}
                                            onStatusFilterChange={setStatusFilter}
                                        />
                                    ) :
                                    (
                                        <RawXmlView xml={rawXml} />
                                    )}
                            </>
                        ))}
            </main>
        </div>
    );
};

export { App };
