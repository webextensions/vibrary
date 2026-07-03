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
        const activeTab = tabs.find(function (tab) { return tab.path === activePath; });
        const activeLabel = activeTab === undefined ? 'tab' : tabLabel(activeTab);
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
                    aria-label={`Close ${activeLabel}`}
                    title={`Close ${activeLabel}`}
                    onClick={function () {
                        onClose(activePath);
                    }}
                >
                    <CloseIcon />
                </button>
            </div>
        );
    }

    // The ARIA tabs keyboard pattern for the tablist role claimed below: Left/Right/Home/End move between tabs with
    // selection following focus, and the roving tabindex (only the active tab is a Tab stop) keeps the strip one stop
    // in the page's Tab order. The handler lives on the strip and finds the rendered tab buttons by role, so it needs
    // no per-tab refs.
    const handleTabListKeyDown = function (keyEvent: React.KeyboardEvent<HTMLDivElement>) {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(keyEvent.key)) {
            return;
        }
        // Only when focus is on a tab itself: the strip also contains each tab's More/Close buttons and the open
        // context menu, and arrow keys there must not hijack tab selection.
        if (!(keyEvent.target instanceof HTMLElement) || keyEvent.target.getAttribute('role') !== 'tab') {
            return;
        }
        const index = tabs.findIndex(function (tab) { return tab.path === activePath; });
        if (index === -1) {
            return;
        }
        let next;
        if (keyEvent.key === 'ArrowLeft') {
            next = (index + (tabs.length - 1)) % tabs.length;
        } else if (keyEvent.key === 'ArrowRight') {
            next = (index + 1) % tabs.length;
        } else if (keyEvent.key === 'Home') {
            next = 0;
        } else {
            next = tabs.length - 1;
        }
        keyEvent.preventDefault();
        if (next === index) {
            return;
        }
        onSelect(tabs[next].path);
        keyEvent.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
    };

    return (
        <div className={styles.tabStrip} role="tablist" onKeyDown={handleTabListKeyDown}>
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
                            tabIndex={tab.path === activePath ? 0 : -1}
                            // The dirty dot below is visual-only (aria-hidden), so the unsaved state must live in the
                            // accessible name for screen readers to announce it.
                            aria-label={`${tabLabel(tab)}${tab.dirty ? ' (unsaved changes)' : ''}`}
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
