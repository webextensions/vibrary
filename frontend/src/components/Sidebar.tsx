import cx from 'classnames';
import { useMemo, useState } from 'react';

import { ChevronIcon, RefreshIcon } from './Icons.tsx';
import { buildFileTree, type TreeNode } from '../fileTree.ts';
import { type FileCount } from '../useFileCounts.ts';

import styles from './Sidebar.module.css';

type SidebarProperties = {
    files: string[];
    selected: string | null;
    open: boolean;
    isCollapsed: boolean;
    refreshing: boolean;
    countForFile: (name: string) => FileCount;
    onOpen: (name: string) => void;
    onClose: () => void;
    onRefresh: () => void
};

// The approved/total badge beside each file name. A ready count is green; loading shows '...' and an unreadable file '!'.
const FileCountBadge = function ({ count }: { count: FileCount }) {
    if (count.kind === 'ready') {
        return (
            <span className={styles.fileCount} title={`${count.approved} approved of ${count.total} truths`}>
                {count.approved}/{count.total}
            </span>
        );
    }
    return <span className={cx(styles.fileCount, styles.muted)}>{count.kind === 'error' ? '!' : '...'}</span>;
};

type TreeRowsProperties = {
    nodes: TreeNode[];
    depth: number;
    selected: string | null;
    collapsed: Set<string>;
    countForFile: (name: string) => FileCount;
    onOpen: (name: string) => void;
    onToggle: (path: string) => void
};

// Renders one level of the file tree as flat sibling <li>s; folders recurse when open. Indentation comes from each
// row's paddingLeft rather than nested <ul>s, so the existing list styling stays intact.
const TreeRows = function ({ nodes, depth, selected, collapsed, countForFile, onOpen, onToggle }: TreeRowsProperties) {
    return nodes.map(function (node) {
        const indent = { paddingLeft: `${depth * 14}px` };
        if (node.kind === 'file') {
            return (
                <li key={node.path} style={indent}>
                    <button
                        type="button"
                        className={cx(node.path === selected && styles.active)}
                        onClick={function () {
                            onOpen(node.path);
                        }}
                    >
                        <span className={styles.fileName} title={node.name}>{node.name}</span>
                        <FileCountBadge count={countForFile(node.path)} />
                    </button>
                </li>
            );
        }
        const isOpen = !collapsed.has(node.path);
        return (
            <li key={node.path} style={indent}>
                <button
                    type="button"
                    className={styles.folderRow}
                    aria-expanded={isOpen}
                    onClick={function () {
                        onToggle(node.path);
                    }}
                >
                    <ChevronIcon />
                    <span className={styles.fileName} title={node.name}>{node.name}</span>
                </button>
                {isOpen && (
                    <ul>
                        <TreeRows
                            nodes={node.children}
                            depth={depth + 1}
                            selected={selected}
                            collapsed={collapsed}
                            countForFile={countForFile}
                            onOpen={onOpen}
                            onToggle={onToggle}
                        />
                    </ul>
                )}
            </li>
        );
    });
};

const Sidebar = function ({ files, selected, open, isCollapsed, refreshing, countForFile, onOpen, onClose, onRefresh }: SidebarProperties) {
    const tree = useMemo(function () {
        return buildFileTree(files);
    }, [files]);
    const [collapsed, setCollapsed] = useState<Set<string>>(function () {
        return new Set();
    });

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
        <>
            {open && <div className={styles.sidebarOverlay} onClick={onClose} />}

            <aside className={cx(styles.sidebar, open && styles.open, isCollapsed && styles.collapsed)}>
                <div className={styles.sidebarHead}>
                    <h1>truths</h1>
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
                </div>
                {files.length === 0 ?
                    (
                        <p className={styles.empty}>No truths.xml or truths-*.xml files in this folder.</p>
                    ) :
                    (
                        <ul>
                            <TreeRows
                                nodes={tree}
                                depth={0}
                                selected={selected}
                                collapsed={collapsed}
                                countForFile={countForFile}
                                onOpen={onOpen}
                                onToggle={handleToggle}
                            />
                        </ul>
                    )}
            </aside>
        </>
    );
};

export { Sidebar };
