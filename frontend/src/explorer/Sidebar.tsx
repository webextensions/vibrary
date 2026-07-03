import cx from 'classnames';
import { useMemo, useState } from 'react';

import { AccordionSection } from '../shared/AccordionSection.tsx';
import { MenuPanel } from '../shared/MenuPanel.tsx';
import { ChevronIcon, CloseIcon, EditIcon, MoreIcon, PlusIcon, RefreshIcon, RemoveIcon } from '../shared/Icons.tsx';
import { type TabInfo, tabLabel } from '../tabs/tabLabel.ts';
import { buildFileTree, collectFolderPaths, type TreeNode } from './fileTree.ts';
import { useDismissablePopup } from '../shared/useDismissablePopup.ts';
import { useEscapeToClear } from '../shared/useEscapeToClear.ts';
import { type FileCount } from './useFileCounts.ts';

import styles from './Sidebar.module.css';

type SidebarProperties = {
    files: string[];
    hasVibraryInclude: boolean;
    // The empty state's one-click bootstrap: writes a starter .vibraryinclude and refreshes the listing.
    onCreateInclude: () => void;
    selected: string | null;
    refreshing: boolean;
    countForFile: (name: string) => FileCount;
    openTabs: TabInfo[];
    onOpen: (name: string) => void;
    onRefresh: () => void;
    onAddFile: () => void;
    onDelete: (node: TreeNode) => void;
    onRename: (node: TreeNode) => void;
    onDuplicate: (node: TreeNode) => void;
    onNewFile: (folderPath: string) => void;
    onSelectTab: (path: string) => void;
    onCloseTab: (path: string) => void;
    // Bulk-delete the given files (paths), confirming first; resolves true if the user confirmed (regardless of
    // whether every individual delete succeeded), false if they cancelled - the caller uses this to decide whether to
    // clear its selection.
    onBulkDelete: (paths: string[]) => Promise<boolean>
};

// The approved/total badge beside each file name. A ready count is green; loading shows '...' and an unreadable file '!'.
const FileCountBadge = function ({ count }: { count: FileCount }) {
    if (count.kind === 'ready') {
        return (
            <span className={styles.fileCount} title={`${count.approved} approved of ${count.total} entries`}>
                {count.approved}/{count.total}
            </span>
        );
    }
    return <span className={cx(styles.fileCount, styles.muted)}>{count.kind === 'error' ? '!' : '...'}</span>;
};

// One row of the "Open Editors" list: the open tab's label (basename for files, the job name for activity tabs - same
// labelling as the editor tab bar), a dirty dot, and a hover-revealed close button. Clicking the row focuses the tab.
const OpenEditorRow = function (
    { tab, active, onSelect, onClose }:
    { tab: TabInfo; active: boolean; onSelect: (path: string) => void; onClose: (path: string) => void }
) {
    return (
        <li>
            <div className={styles.treeRow}>
                <button
                    type="button"
                    className={cx(styles.rowButton, active && styles.active)}
                    // The dirty dot below is visual-only (aria-hidden), so the unsaved state must live in the
                    // accessible name - same treatment as the tab strip's buttons in TabBar.
                    aria-label={`${tabLabel(tab)}${tab.dirty ? ' (unsaved changes)' : ''}`}
                    title={tab.label ?? tab.path}
                    onClick={function () {
                        onSelect(tab.path);
                    }}
                >
                    {tab.dirty && <span className={styles.tabDot} aria-hidden="true" />}
                    <span className={styles.fileName}>{tabLabel(tab)}</span>
                </button>
                <button
                    type="button"
                    className={styles.rowClose}
                    aria-label={`Close ${tabLabel(tab)}`}
                    title="Close"
                    onClick={function (clickEvent) {
                        clickEvent.stopPropagation();
                        onClose(tab.path);
                    }}
                >
                    <CloseIcon />
                </button>
            </div>
        </li>
    );
};

type RowMoreProperties = {
    node: TreeNode;
    isOpen: boolean;
    onToggleMenu: (path: string) => void;
    onDelete: (node: TreeNode) => void;
    onRename: (node: TreeNode) => void;
    onDuplicate: (node: TreeNode) => void;
    onNewFile: (folderPath: string) => void
};

// The per-row "More" kebab button and its dropdown. Files get "Rename...", "Duplicate..." and "Delete"; folders also
// get "New File..." (duplicating a folder is not offered - it has no single on-disk entity to copy). The menu closes
// itself before running an action so the action's own dialog opens over a clean tree.
const RowMore = function ({ node, isOpen, onToggleMenu, onDelete, onRename, onDuplicate, onNewFile }: RowMoreProperties) {
    return (
        <div className={styles.rowMore}>
            <button
                type="button"
                className={styles.moreButton}
                aria-label="More options"
                aria-haspopup="menu"
                aria-expanded={isOpen}
                title="More"
                onClick={function (clickEvent) {
                    clickEvent.stopPropagation();
                    onToggleMenu(node.path);
                }}
            >
                <MoreIcon />
            </button>
            {isOpen && (
                <MenuPanel className={styles.moreMenu}>
                    {node.kind === 'folder' && (
                        <button
                            type="button"
                            role="menuitem"
                            onClick={function (clickEvent) {
                                clickEvent.stopPropagation();
                                onToggleMenu(node.path);
                                onNewFile(node.path);
                            }}
                        >
                            <PlusIcon />
                            New File...
                        </button>
                    )}
                    <button
                        type="button"
                        role="menuitem"
                        onClick={function (clickEvent) {
                            clickEvent.stopPropagation();
                            onToggleMenu(node.path);
                            onRename(node);
                        }}
                    >
                        <EditIcon />
                        Rename...
                    </button>
                    {node.kind === 'file' && (
                        <button
                            type="button"
                            role="menuitem"
                            onClick={function (clickEvent) {
                                clickEvent.stopPropagation();
                                onToggleMenu(node.path);
                                onDuplicate(node);
                            }}
                        >
                            <PlusIcon />
                            Duplicate...
                        </button>
                    )}
                    <button
                        type="button"
                        role="menuitem"
                        className={styles.menuDanger}
                        onClick={function (clickEvent) {
                            clickEvent.stopPropagation();
                            onToggleMenu(node.path);
                            onDelete(node);
                        }}
                    >
                        <RemoveIcon />
                        Delete
                    </button>
                </MenuPanel>
            )}
        </div>
    );
};

type TreeRowsProperties = {
    nodes: TreeNode[];
    depth: number;
    selected: string | null;
    collapsed: Set<string>;
    openMenuPath: string | null;
    selectedPaths: Set<string>;
    countForFile: (name: string) => FileCount;
    onOpen: (name: string) => void;
    onToggle: (path: string) => void;
    onToggleMenu: (path: string) => void;
    onToggleFileSelect: (path: string) => void;
    onDelete: (node: TreeNode) => void;
    onRename: (node: TreeNode) => void;
    onDuplicate: (node: TreeNode) => void;
    onNewFile: (folderPath: string) => void
};

// Renders one level of the file tree as flat sibling <li>s; folders recurse when open. Indentation comes from each
// row's paddingLeft rather than nested <ul>s, so the existing list styling stays intact.
const TreeRows = function ({ nodes, depth, selected, collapsed, openMenuPath, selectedPaths, countForFile, onOpen, onToggle, onToggleMenu, onToggleFileSelect, onDelete, onRename, onDuplicate, onNewFile }: TreeRowsProperties) {
    return nodes.map(function (node) {
        const indent = { paddingLeft: `${depth * 14}px` };
        const more = (
            <RowMore
                node={node}
                isOpen={openMenuPath === node.path}
                onToggleMenu={onToggleMenu}
                onDelete={onDelete}
                onRename={onRename}
                onDuplicate={onDuplicate}
                onNewFile={onNewFile}
            />
        );
        if (node.kind === 'file') {
            return (
                <li key={node.path} style={indent}>
                    <div className={styles.treeRow}>
                        <input
                            type="checkbox"
                            className={styles.selectCheckbox}
                            checked={selectedPaths.has(node.path)}
                            aria-label={`Select ${node.name}`}
                            onClick={function (clickEvent) {
                                clickEvent.stopPropagation();
                            }}
                            onChange={function () {
                                onToggleFileSelect(node.path);
                            }}
                        />
                        <button
                            type="button"
                            className={cx(styles.rowButton, node.path === selected && styles.active)}
                            onClick={function () {
                                onOpen(node.path);
                            }}
                        >
                            <span className={styles.fileName} title={node.name}>{node.name}</span>
                            <FileCountBadge count={countForFile(node.path)} />
                        </button>
                        {more}
                    </div>
                </li>
            );
        }
        const isOpen = !collapsed.has(node.path);
        return (
            <li key={node.path} style={indent}>
                <div className={styles.treeRow}>
                    <button
                        type="button"
                        className={cx(styles.rowButton, styles.folderRow)}
                        aria-expanded={isOpen}
                        onClick={function () {
                            onToggle(node.path);
                        }}
                    >
                        <ChevronIcon />
                        <span className={styles.fileName} title={node.name}>{node.name}</span>
                    </button>
                    {more}
                </div>
                {isOpen && (
                    <ul>
                        <TreeRows
                            nodes={node.children}
                            depth={depth + 1}
                            selected={selected}
                            collapsed={collapsed}
                            openMenuPath={openMenuPath}
                            selectedPaths={selectedPaths}
                            countForFile={countForFile}
                            onOpen={onOpen}
                            onToggle={onToggle}
                            onToggleMenu={onToggleMenu}
                            onToggleFileSelect={onToggleFileSelect}
                            onDelete={onDelete}
                            onRename={onRename}
                            onDuplicate={onDuplicate}
                            onNewFile={onNewFile}
                        />
                    </ul>
                )}
            </li>
        );
    });
};

const Sidebar = function ({ files, hasVibraryInclude, selected, refreshing, countForFile, openTabs, onOpen, onRefresh, onAddFile, onCreateInclude, onDelete, onRename, onDuplicate, onNewFile, onSelectTab, onCloseTab, onBulkDelete }: SidebarProperties) {
    const tree = useMemo(function () {
        return buildFileTree(files);
    }, [files]);
    // Every folder path in the current tree, for the "Collapse all" action below - a folder not yet seen (a fresh one
    // from a refresh) is implicitly expanded, since `collapsed` only ever names folders explicitly toggled shut.
    const allFolderPaths = useMemo(function () {
        return tree.flatMap(function (node) {
            return collectFolderPaths(node);
        });
    }, [tree]);
    const [collapsed, setCollapsed] = useState<Set<string>>(function () {
        return new Set();
    });
    // Which row's "More" menu is open (by path), or null when none. Only one menu is open at a time.
    const [openMenuPath, setOpenMenuPath] = useState<string | null>(null);
    // Accordion section open state, both local and defaulting to open.
    const [openEditorsOpen, setOpenEditorsOpen] = useState<boolean>(true);
    const [vibraryOpen, setVibraryOpen] = useState<boolean>(true);
    // File paths checked for the bulk Delete action below the tree - mirrors SpecsEditor's per-entry selection. Files
    // only (not folders): rename/duplicate need a per-item new name, so Delete is the one operation that generalizes
    // cleanly to an arbitrary multi-file selection.
    const [rawSelectedPaths, setRawSelectedPaths] = useState<Set<string>>(function () {
        return new Set();
    });
    // Drop any selected path that no longer exists (deleted/renamed via the single-row action, or the list refreshed
    // out from under the selection) on every render, so the footer's count never outlives the files it counts. A plain
    // derivation rather than a setState effect - there is nothing to synchronize with an external system here.
    const selectedPaths = useMemo(function () {
        const present = new Set(files);
        return new Set(Array.from(rawSelectedPaths).filter(function (path) {
            return present.has(path);
        }));
    }, [rawSelectedPaths, files]);

    // Close the open menu on any click outside it, or on Escape. The menu's own buttons stop propagation, so the click
    // listener only fires for clicks elsewhere; the toggle button also stops propagation so opening one menu does not
    // immediately re-close it.
    useDismissablePopup(openMenuPath !== null, function () { setOpenMenuPath(null); });

    // Escape clears the file selection (the app-wide convention, shared with SpecsEditor's entry selection via
    // useEscapeToClear, which also stands down while any dialog is open). Skipped while a row menu is open, so its
    // own Escape handler closes it first rather than also wiping the selection.
    useEscapeToClear(selectedPaths.size > 0 && openMenuPath === null, function () {
        setRawSelectedPaths(new Set());
    });

    const handleToggleMenu = function (path: string) {
        setOpenMenuPath(function (previous) {
            return previous === path ? null : path;
        });
    };

    const handleToggle = function (path: string) {
        setCollapsed(function (previous) {
            const next = new Set(previous);
            if (next.has(path)) {
                next.delete(path);
            } else {
                next.add(path);
            }
            return next;
        });
    };

    // Collapse every folder in the tree at once, mirroring the file explorer's own "Collapse All" convention (only
    // that direction - not a paired "Expand all" - matches per-folder collapse being the one bulk action worth having
    // here; opening every nested folder at once is rarely what someone wants from a deep tree).
    const handleCollapseAll = function () {
        setCollapsed(new Set(allFolderPaths));
    };

    const handleToggleFileSelect = function (path: string) {
        setRawSelectedPaths(function (previous) {
            const next = new Set(previous);
            if (next.has(path)) {
                next.delete(path);
            } else {
                next.add(path);
            }
            return next;
        });
    };

    const handleSelectAllFiles = function () {
        setRawSelectedPaths(new Set(files));
    };

    const handleDeselectAllFiles = function () {
        setRawSelectedPaths(new Set());
    };

    const handleBulkDeleteClick = async function () {
        const confirmed = await onBulkDelete(Array.from(selectedPaths));
        if (confirmed) {
            setRawSelectedPaths(new Set());
        }
    };

    return (
        <div className={styles.sidebar}>
            <AccordionSection
                title="Open Editors"
                expanded={openEditorsOpen}
                onToggle={function () {
                    setOpenEditorsOpen(function (previous) {
                        return !previous;
                    });
                }}
                badge={openTabs.length > 0 ? <span className={styles.activityCount}>{openTabs.length}</span> : undefined}
            >
                {openTabs.length === 0 ?
                    (
                        <p className={styles.empty}>No open editors.</p>
                    ) :
                    (
                        <ul>
                            {openTabs.map(function (tab) {
                                return (
                                    <OpenEditorRow
                                        key={tab.path}
                                        tab={tab}
                                        active={tab.path === selected}
                                        onSelect={onSelectTab}
                                        onClose={onCloseTab}
                                    />
                                );
                            })}
                        </ul>
                    )}
            </AccordionSection>

            <AccordionSection
                title="Vibrary"
                expanded={vibraryOpen}
                onToggle={function () {
                    setVibraryOpen(function (previous) {
                        return !previous;
                    });
                }}
                actions={(
                    <>
                        <button
                            type="button"
                            className={styles.sidebarAction}
                            aria-label="Add file"
                            title="Add file"
                            onClick={onAddFile}
                        >
                            <PlusIcon />
                        </button>
                        <button
                            type="button"
                            className={cx(styles.sidebarRefresh, refreshing && styles.refreshing)}
                            aria-label="Refresh file list"
                            title="Refresh file list"
                            onClick={onRefresh}
                            disabled={refreshing}
                        >
                            <RefreshIcon />
                        </button>
                        <button
                            type="button"
                            className={styles.sidebarAction}
                            aria-label="Collapse all folders"
                            title="Collapse all folders"
                            onClick={handleCollapseAll}
                            disabled={allFolderPaths.every(function (path) { return collapsed.has(path); })}
                        >
                            <ChevronIcon />
                        </button>
                    </>
                )}
            >
                {files.length === 0 ?
                    (
                        <div className={styles.empty}>
                            {hasVibraryInclude ?
                                <p>No reviews / specs / tasks / ideas files match the patterns in .vibraryinclude.</p> :
                                (
                                    <>
                                        <p>
                                            No .vibraryinclude file found. It chooses which reviews / specs / tasks /
                                            ideas files are shown, with gitignore-style patterns ("!" re-excludes).
                                        </p>
                                        <button type="button" className={styles.emptyAction} onClick={onCreateInclude}>
                                            Create .vibraryinclude
                                        </button>
                                    </>
                                )}
                        </div>
                    ) :
                    (
                        <>
                            <ul>
                                <TreeRows
                                    nodes={tree}
                                    depth={0}
                                    selected={selected}
                                    collapsed={collapsed}
                                    openMenuPath={openMenuPath}
                                    selectedPaths={selectedPaths}
                                    countForFile={countForFile}
                                    onOpen={onOpen}
                                    onToggle={handleToggle}
                                    onToggleMenu={handleToggleMenu}
                                    onToggleFileSelect={handleToggleFileSelect}
                                    onDelete={onDelete}
                                    onRename={onRename}
                                    onDuplicate={onDuplicate}
                                    onNewFile={onNewFile}
                                />
                            </ul>
                            <div className={styles.selectionFooter}>
                                <span className={styles.footerCount}>
                                    {selectedPaths.size > 0 ?
                                        `${selectedPaths.size}/${files.length} files selected` :
                                        `${files.length} files`}
                                </span>
                                <button
                                    type="button"
                                    className={styles.selectLink}
                                    disabled={selectedPaths.size === files.length}
                                    onClick={handleSelectAllFiles}
                                >
                                    Select all
                                </button>
                                <button
                                    type="button"
                                    className={styles.selectLink}
                                    disabled={selectedPaths.size === 0}
                                    onClick={handleDeselectAllFiles}
                                >
                                    Deselect all
                                </button>
                                <button
                                    type="button"
                                    className={styles.deleteSelected}
                                    disabled={selectedPaths.size === 0}
                                    onClick={function () {
                                        void handleBulkDeleteClick();
                                    }}
                                >
                                    <RemoveIcon />
                                    Delete
                                </button>
                            </div>
                        </>
                    )}
            </AccordionSection>
        </div>
    );
};

export { Sidebar };
