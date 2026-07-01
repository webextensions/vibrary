import cx from 'classnames';
import { useEffect, useMemo, useState } from 'react';

import { AccordionSection } from './AccordionSection.tsx';
import { ChevronIcon, CloseIcon, EditIcon, MoreIcon, PlusIcon, RefreshIcon, RemoveIcon } from './Icons.tsx';
import { type TabInfo, tabLabel } from './tabLabel.ts';
import { buildFileTree, type TreeNode } from '../fileTree.ts';
import { type FileCount } from '../useFileCounts.ts';

import styles from './Sidebar.module.css';

type SidebarProperties = {
    files: string[];
    hasVibraryInclude: boolean;
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
    onCloseTab: (path: string) => void
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
                <div className={styles.moreMenu} role="menu">
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
                </div>
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
    countForFile: (name: string) => FileCount;
    onOpen: (name: string) => void;
    onToggle: (path: string) => void;
    onToggleMenu: (path: string) => void;
    onDelete: (node: TreeNode) => void;
    onRename: (node: TreeNode) => void;
    onDuplicate: (node: TreeNode) => void;
    onNewFile: (folderPath: string) => void
};

// Renders one level of the file tree as flat sibling <li>s; folders recurse when open. Indentation comes from each
// row's paddingLeft rather than nested <ul>s, so the existing list styling stays intact.
const TreeRows = function ({ nodes, depth, selected, collapsed, openMenuPath, countForFile, onOpen, onToggle, onToggleMenu, onDelete, onRename, onDuplicate, onNewFile }: TreeRowsProperties) {
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
                            countForFile={countForFile}
                            onOpen={onOpen}
                            onToggle={onToggle}
                            onToggleMenu={onToggleMenu}
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

const Sidebar = function ({ files, hasVibraryInclude, selected, refreshing, countForFile, openTabs, onOpen, onRefresh, onAddFile, onDelete, onRename, onDuplicate, onNewFile, onSelectTab, onCloseTab }: SidebarProperties) {
    const tree = useMemo(function () {
        return buildFileTree(files);
    }, [files]);
    const [collapsed, setCollapsed] = useState<Set<string>>(function () {
        return new Set();
    });
    // Which row's "More" menu is open (by path), or null when none. Only one menu is open at a time.
    const [openMenuPath, setOpenMenuPath] = useState<string | null>(null);
    // Accordion section open state, both local and defaulting to open.
    const [openEditorsOpen, setOpenEditorsOpen] = useState<boolean>(true);
    const [vibraryOpen, setVibraryOpen] = useState<boolean>(true);

    // Close the open menu on any click outside it. The menu's own buttons stop propagation, so this only fires for
    // clicks elsewhere; the toggle button also stops propagation so opening one menu does not immediately re-close it.
    useEffect(function () {
        if (openMenuPath === null) {
            return undefined;
        }
        const handleDocumentClick = function () {
            setOpenMenuPath(null);
        };
        document.addEventListener('click', handleDocumentClick);
        return function () {
            document.removeEventListener('click', handleDocumentClick);
        };
    }, [openMenuPath]);

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
                    </>
                )}
            >
                {files.length === 0 ?
                    (
                        <p className={styles.empty}>
                            {hasVibraryInclude ?
                                'No reviews / specs / tasks files match the patterns in .vibraryinclude.' :
                                'No .vibraryinclude file found. Add one with gitignore-style patterns (e.g. "specs*.xml") to choose which reviews / specs / tasks files to show; prefix a pattern with "!" to re-exclude.'}
                        </p>
                    ) :
                    (
                        <ul>
                            <TreeRows
                                nodes={tree}
                                depth={0}
                                selected={selected}
                                collapsed={collapsed}
                                openMenuPath={openMenuPath}
                                countForFile={countForFile}
                                onOpen={onOpen}
                                onToggle={handleToggle}
                                onToggleMenu={handleToggleMenu}
                                onDelete={onDelete}
                                onRename={onRename}
                                onDuplicate={onDuplicate}
                                onNewFile={onNewFile}
                            />
                        </ul>
                    )}
            </AccordionSection>
        </div>
    );
};

export { Sidebar };
