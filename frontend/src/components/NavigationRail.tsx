import cx from 'classnames';
import type { ReactNode } from 'react';

import { ExplorerIcon, SearchIcon, SourceControlIcon } from './Icons.tsx';

import styles from './NavigationRail.module.css';

// Which view the left panel currently shows. Owned by LeftPanel; the rail selects it.
type LeftView = 'explorer' | 'search' | 'sourceControl';

const RAIL_ITEMS: { view: LeftView; label: string; Icon: () => ReactNode }[] = [
    { view: 'explorer', label: 'Explorer', Icon: ExplorerIcon },
    { view: 'search', label: 'Search', Icon: SearchIcon },
    { view: 'sourceControl', label: 'Source Control', Icon: SourceControlIcon }
];

// The VS Code-style activity bar down the far-left edge: one icon button per view. The active button is highlighted and
// carries an accent indicator bar. Clicking the active button is how the caller collapses/expands the panel, so it stays
// a normal button (no disabled state).
const NavigationRail = function ({ active, onSelect }: { active: LeftView; onSelect: (view: LeftView) => void }) {
    return (
        <nav className={styles.rail} aria-label="Views">
            {RAIL_ITEMS.map(function ({ view, label, Icon }) {
                return (
                    <button
                        key={view}
                        type="button"
                        className={cx(styles.railButton, active === view && styles.active)}
                        aria-label={label}
                        aria-pressed={active === view}
                        title={label}
                        onClick={function () {
                            onSelect(view);
                        }}
                    >
                        <Icon />
                    </button>
                );
            })}
        </nav>
    );
};

export { NavigationRail };
export type { LeftView };
