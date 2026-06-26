import cx from 'classnames';
import { useEffect, useState } from 'react';
import { Resizable } from 're-resizable';

import { type FileCount } from '../useFileCounts.ts';
import { type TreeNode } from '../fileTree.ts';
import { useMediaQuery } from '../useMediaQuery.ts';
import { type LeftView, NavigationRail } from './NavigationRail.tsx';
import { SearchPanel } from './SearchPanel.tsx';
import { Sidebar } from './Sidebar.tsx';
import { SourceControlPanel } from './SourceControlPanel.tsx';

import styles from './LeftPanel.module.css';

// Below this width the panel is an off-canvas drawer rather than an inline column; read at click time so a same-view
// rail tap can choose between toggling the desktop collapse and closing the mobile drawer.
const MOBILE_QUERY = '(max-width: 700px)';

// The resizable body's width is remembered across reloads, like the collapse flag in App. Same plain-localStorage idiom
// (try/catch, 'runbooks:' namespace). Clamped to [MIN_WIDTH, 40% of the viewport] so a stale or hand-edited value can
// never wedge the panel off-screen or too narrow to use; DEFAULT_WIDTH matches the original fixed column.
const PANEL_WIDTH_KEY = 'runbooks:panel-width';
const MIN_WIDTH = 180;
const DEFAULT_WIDTH = 260;

const clampWidth = function (width: number, max: number): number {
    return Math.min(max, Math.max(MIN_WIDTH, width));
};

const readStoredWidth = function (): number {
    try {
        const stored = Number(window.localStorage.getItem(PANEL_WIDTH_KEY));
        return Number.isFinite(stored) && stored > 0 ? stored : DEFAULT_WIDTH;
    } catch {
        return DEFAULT_WIDTH;
    }
};

const persistWidth = function (width: number): void {
    try {
        window.localStorage.setItem(PANEL_WIDTH_KEY, String(width));
    } catch {
        // Ignore: storage blocked or full means we just do not persist this preference.
    }
};

// Track the viewport width so the panel's max width can follow window resizes. useSyncExternalStore keeps matchMedia /
// innerWidth as the single source of truth, mirroring useMediaQuery.
const useViewportWidth = function (): number {
    const [width, setWidth] = useState(function () {
        return window.innerWidth;
    });
    useEffect(function () {
        const handleResize = function () {
            setWidth(window.innerWidth);
        };
        window.addEventListener('resize', handleResize);
        return function () {
            window.removeEventListener('resize', handleResize);
        };
    }, []);
    return width;
};

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
    // Below the mobile breakpoint the panel is an off-canvas drawer that fills its width, so it is not resizable; above
    // it, the body is a draggable column whose width is remembered.
    const isMobile = useMediaQuery(MOBILE_QUERY);
    const [panelWidth, setPanelWidth] = useState<number>(readStoredWidth);
    // Suppresses the wrapper's width transition during an active drag so the grabber tracks the pointer without lag.
    const [resizing, setResizing] = useState<boolean>(false);
    const maxWidth = Math.round(useViewportWidth() * 0.4);

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

    const handleResizeStop = function (_event: unknown, _direction: unknown, element: HTMLElement) {
        const next = clampWidth(element.offsetWidth, maxWidth);
        setResizing(false);
        setPanelWidth(next);
        persistWidth(next);
    };

    const body = (
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
    );

    return (
        <>
            {open && <div className={styles.overlay} onClick={onClose} />}

            <aside className={cx(styles.leftPanel, open && styles.open)}>
                <NavigationRail active={activeView} onSelect={handleSelectView} />

                {isMobile ?
                    body :
                    <Resizable
                        className={cx(styles.resizableBody, resizing && styles.resizing)}
                        // Controlled width: re-resizable tracks the live drag internally and re-syncs whenever this
                        // changes, so collapsing to 0 (and expanding back) stays driven by isCollapsed.
                        size={{ width: isCollapsed ? 0 : Math.min(panelWidth, maxWidth), height: '100%' }}
                        // re-resizable writes minWidth as an inline style, which would otherwise floor the collapsed
                        // width at MIN_WIDTH; drop it to 0 while collapsed so the body can shrink fully to 0.
                        minWidth={isCollapsed ? 0 : MIN_WIDTH}
                        maxWidth={maxWidth}
                        enable={{ right: !isCollapsed }}
                        handleClasses={{ right: styles.resizeHandle }}
                        onResizeStart={function () {
                            setResizing(true);
                        }}
                        onResizeStop={handleResizeStop}
                    >
                        {body}
                    </Resizable>}
            </aside>
        </>
    );
};

export { LeftPanel };
