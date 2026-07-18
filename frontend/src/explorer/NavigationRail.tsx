import cx from 'classnames';
import type { ReactNode } from 'react';

import { ActivityIcon, CloseIcon, ExplorerIcon, HelpIcon, SearchIcon, SourceControlIcon, TrophyIcon } from '../shared/Icons.tsx';

import styles from './NavigationRail.module.css';

// Which view the left panel currently shows. Owned by LeftPanel; the rail selects it.
type LeftView = 'explorer' | 'search' | 'rankings' | 'sourceControl' | 'activity';

const RAIL_ITEMS: { view: LeftView; label: string; Icon: () => ReactNode }[] = [
    { view: 'explorer', label: 'Explorer', Icon: ExplorerIcon },
    { view: 'search', label: 'Search', Icon: SearchIcon },
    { view: 'rankings', label: 'Rankings', Icon: TrophyIcon },
    { view: 'sourceControl', label: 'Source Control', Icon: SourceControlIcon },
    { view: 'activity', label: 'Activity monitor', Icon: ActivityIcon }
];

// The VS Code-style activity bar down the far-left edge: one icon button per view. The active button is highlighted and
// carries an accent indicator bar. Clicking the active button is how the caller collapses/expands the panel, so it stays
// a normal button (no disabled state). A view's badge (e.g. the running+queued job count) is shown over its icon. When
// onClose is passed (the mobile drawer), a close button leads the rail so the drawer can be dismissed without reaching
// back to the toolbar toggle.
const NavigationRail = function ({ active, onSelect, badges, onClose, onShowHelp }: { active: LeftView; onSelect: (view: LeftView) => void; badges?: Partial<Record<LeftView, number>>; onClose?: () => void; onShowHelp?: () => void }) {
    return (
        <nav className={styles.rail} aria-label="Views">
            {onClose &&
            <button
                type="button"
                className={styles.railButton}
                aria-label="Close panel"
                title="Close panel"
                onClick={onClose}
            >
                <CloseIcon />
            </button>}
            {RAIL_ITEMS.map(function ({ view, label, Icon }) {
                const count = badges?.[view] ?? 0;
                return (
                    <button
                        key={view}
                        type="button"
                        className={cx(styles.railButton, active === view && styles.active)}
                        // The badge below is a bare number over the icon; fold it into the accessible name so the
                        // count reaches screen readers too.
                        aria-label={count > 0 ? `${label} (${count} active)` : label}
                        aria-pressed={active === view}
                        title={label}
                        onClick={function () {
                            onSelect(view);
                        }}
                    >
                        <Icon />
                        {count > 0 && <span className={styles.railBadge}>{count}</span>}
                    </button>
                );
            })}
            {onShowHelp &&
            <button
                type="button"
                className={cx(styles.railButton, styles.railButtonBottom)}
                aria-label="Help"
                title="Help (?)"
                onClick={onShowHelp}
            >
                <HelpIcon />
            </button>}
        </nav>
    );
};

export { NavigationRail };
export type { LeftView };
