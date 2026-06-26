import cx from 'classnames';
import { useState } from 'react';

import { type FileCount } from '../useFileCounts.ts';
import { type TreeNode } from '../fileTree.ts';
import { type LeftView, NavigationRail } from './NavigationRail.tsx';
import { SearchPanel } from './SearchPanel.tsx';
import { Sidebar } from './Sidebar.tsx';
import { SourceControlPanel } from './SourceControlPanel.tsx';

import styles from './LeftPanel.module.css';

// Below this width the panel is an off-canvas drawer rather than an inline column; read at click time so a same-view
// rail tap can choose between toggling the desktop collapse and closing the mobile drawer.
const MOBILE_QUERY = '(max-width: 700px)';

type LeftPanelProperties = {
    // Explorer (file tree) props, forwarded straight to Sidebar.
    files: string[];
    selected: string | null;
    refreshing: boolean;
    countForFile: (name: string) => FileCount;
    onOpen: (name: string) => void;
    onRefresh: () => void;
    onAddFile: () => void;
    onDelete: (node: TreeNode) => void;
    onNewFile: (folderPath: string) => void;
    onOpenActivity: (jobId: string, title: string) => void;
    // Search: open the file holding a clicked match and ask the editor to scroll to / highlight it.
    onOpenMatch: (name: string, query: string) => void;
    // Responsive wrapper state, owned by App: the mobile drawer's open flag and the desktop collapse flag, plus the
    // callbacks that toggle the collapse (per breakpoint) or force the panel expanded.
    open: boolean;
    onClose: () => void;
    isCollapsed: boolean;
    onToggleCollapse: () => void;
    onExpand: () => void
};

// The left panel: the navigation rail beside a body that switches between Explorer, Search and Source Control. Owns the
// active-view state and the responsive shell (mobile drawer + desktop collapse) that used to live on the Sidebar.
const LeftPanel = function (properties: LeftPanelProperties) {
    const { open, onClose, isCollapsed, onToggleCollapse, onExpand, onOpenMatch } = properties;
    const [activeView, setActiveView] = useState<LeftView>('explorer');

    // Rail click: tapping the active view's icon collapses/expands the panel (VS Code behavior); tapping another view
    // switches to it and makes sure the panel is expanded so the new view is visible.
    const handleSelectView = function (view: LeftView) {
        if (view === activeView && !window.matchMedia(MOBILE_QUERY).matches) {
            onToggleCollapse();
            return;
        }
        setActiveView(view);
        onExpand();
    };

    return (
        <>
            {open && <div className={styles.overlay} onClick={onClose} />}

            <aside className={cx(styles.leftPanel, open && styles.open, isCollapsed && styles.collapsed)}>
                <NavigationRail active={activeView} onSelect={handleSelectView} />

                <div className={styles.panelBody}>
                    {activeView === 'explorer' &&
                    <Sidebar
                        files={properties.files}
                        selected={properties.selected}
                        refreshing={properties.refreshing}
                        countForFile={properties.countForFile}
                        onOpen={properties.onOpen}
                        onRefresh={properties.onRefresh}
                        onAddFile={properties.onAddFile}
                        onDelete={properties.onDelete}
                        onNewFile={properties.onNewFile}
                        onOpenActivity={properties.onOpenActivity}
                    />}
                    {activeView === 'search' && <SearchPanel onOpenMatch={onOpenMatch} />}
                    {activeView === 'sourceControl' && <SourceControlPanel />}
                </div>
            </aside>
        </>
    );
};

export { LeftPanel };
