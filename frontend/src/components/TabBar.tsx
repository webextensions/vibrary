import cx from 'classnames';
import { useState } from 'react';

import { CloseIcon, MoreIcon } from './Icons.tsx';
import { MenuPanel } from './MenuPanel.tsx';
import { type TabInfo, tabLabel } from './tabLabel.ts';
import { useDismissablePopup } from '../useDismissablePopup.ts';
import { useMediaQuery } from '../useMediaQuery.ts';

import styles from './TabBar.module.css';

// Below this width the strip collapses to a dropdown switcher; matches the sidebar's drawer breakpoint in App.
const MOBILE_QUERY = '(max-width: 700px)';

type TabBarProperties = {
    tabs: TabInfo[];
    activePath: string;
    onSelect: (path: string) => void;
    onClose: (path: string) => void;
    onCloseOthers: (path: string) => void;
    onCloseAll: () => void
};

const TabBar = function ({ tabs, activePath, onSelect, onClose, onCloseOthers, onCloseAll }: TabBarProperties) {
    const isMobile = useMediaQuery(MOBILE_QUERY);
    // Which tab's context menu is open (by path), or null when none - opened by right-clicking a tab. Mirrors the
    // Explorer's one-open-menu-at-a-time kebab.
    const [menuPath, setMenuPath] = useState<string | null>(null);

    // Close the open context menu on any click outside it, or on Escape; the menu's own buttons close it themselves
    // before acting, and stop propagation so their clicks never reach the document listener.
    useDismissablePopup(menuPath !== null, function () { setMenuPath(null); });

    if (isMobile) {
        return (
            <div className={styles.tabSwitcher}>
                <select
                    aria-label="Open files"
                    value={activePath}
                    onChange={function (changeEvent) {
                        onSelect(changeEvent.target.value);
                    }}
                >
                    {tabs.map(function (tab) {
                        return (
                            <option key={tab.path} value={tab.path}>
                                {tab.dirty ? '* ' : ''}{tabLabel(tab)}
                            </option>
                        );
                    })}
                </select>
                <button
                    type="button"
                    className={styles.tabClose}
                    aria-label="Close file"
                    title="Close file"
                    onClick={function () {
                        onClose(activePath);
                    }}
                >
                    <CloseIcon />
                </button>
            </div>
        );
    }

    return (
        <div className={styles.tabStrip} role="tablist">
            {tabs.map(function (tab) {
                return (
                    <div
                        key={tab.path}
                        className={cx(styles.tab, tab.path === activePath && styles.active)}
                        onContextMenu={function (contextMenuEvent) {
                            contextMenuEvent.preventDefault();
                            setMenuPath(tab.path);
                        }}
                    >
                        <button
                            type="button"
                            className={styles.tabLabel}
                            role="tab"
                            aria-selected={tab.path === activePath}
                            title={tab.label ?? tab.path}
                            onClick={function () {
                                onSelect(tab.path);
                            }}
                            onAuxClick={function (auxClickEvent) {
                                // Middle-click closes the tab, like browser and editor tab strips.
                                if (auxClickEvent.button === 1) {
                                    onClose(tab.path);
                                }
                            }}
                        >
                            {tab.dirty && <span className={styles.tabDot} aria-hidden="true" />}
                            <span className={styles.tabName}>{tabLabel(tab)}</span>
                        </button>
                        <button
                            type="button"
                            className={styles.tabMore}
                            aria-label={`More actions for ${tabLabel(tab)}`}
                            aria-haspopup="menu"
                            aria-expanded={menuPath === tab.path}
                            title="More"
                            onClick={function (clickEvent) {
                                clickEvent.stopPropagation();
                                setMenuPath(function (previous) {
                                    return previous === tab.path ? null : tab.path;
                                });
                            }}
                        >
                            <MoreIcon />
                        </button>
                        <button
                            type="button"
                            className={styles.tabClose}
                            aria-label={`Close ${tabLabel(tab)}`}
                            title="Close"
                            onClick={function (clickEvent) {
                                clickEvent.stopPropagation();
                                onClose(tab.path);
                            }}
                        >
                            <CloseIcon />
                        </button>
                        {menuPath === tab.path && (
                            <MenuPanel className={styles.tabMenu}>
                                <button
                                    type="button"
                                    role="menuitem"
                                    onClick={function (clickEvent) {
                                        clickEvent.stopPropagation();
                                        setMenuPath(null);
                                        onClose(tab.path);
                                    }}
                                >
                                    Close
                                </button>
                                <button
                                    type="button"
                                    role="menuitem"
                                    disabled={tabs.length === 1}
                                    onClick={function (clickEvent) {
                                        clickEvent.stopPropagation();
                                        setMenuPath(null);
                                        onCloseOthers(tab.path);
                                    }}
                                >
                                    Close Others
                                </button>
                                <button
                                    type="button"
                                    role="menuitem"
                                    onClick={function (clickEvent) {
                                        clickEvent.stopPropagation();
                                        setMenuPath(null);
                                        onCloseAll();
                                    }}
                                >
                                    Close All
                                </button>
                            </MenuPanel>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export { TabBar };
