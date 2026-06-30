import cx from 'classnames';

import { CloseIcon } from './Icons.tsx';
import { type TabInfo, tabLabel } from './tabLabel.ts';
import { useMediaQuery } from '../useMediaQuery.ts';

import styles from './TabBar.module.css';

// Below this width the strip collapses to a dropdown switcher; matches the sidebar's drawer breakpoint in App.
const MOBILE_QUERY = '(max-width: 700px)';

type TabBarProperties = {
    tabs: TabInfo[];
    activePath: string;
    onSelect: (path: string) => void;
    onClose: (path: string) => void
};

const TabBar = function ({ tabs, activePath, onSelect, onClose }: TabBarProperties) {
    const isMobile = useMediaQuery(MOBILE_QUERY);

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
                    <div key={tab.path} className={cx(styles.tab, tab.path === activePath && styles.active)}>
                        <button
                            type="button"
                            className={styles.tabLabel}
                            role="tab"
                            aria-selected={tab.path === activePath}
                            title={tab.label ?? tab.path}
                            onClick={function () {
                                onSelect(tab.path);
                            }}
                        >
                            {tab.dirty && <span className={styles.tabDot} aria-hidden="true" />}
                            <span className={styles.tabName}>{tabLabel(tab)}</span>
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
                    </div>
                );
            })}
        </div>
    );
};

export { TabBar };
