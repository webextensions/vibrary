import { ResponsiveDialog } from './ResponsiveDialog.tsx';

import styles from './ShortcutsDialog.module.css';

// Mac shows "Cmd" for the primary modifier, every other platform "Ctrl" - matching the labels the toolbar buttons
// already use (e.g. "Save (Ctrl+S)"). navigator.platform is deprecated, so key off the user-agent string.
const isMac = typeof navigator !== 'undefined' && /Mac|iP(?:hone|ad|od)/.test(navigator.userAgent);
const MOD = isMac ? 'Cmd' : 'Ctrl';

// The app's keyboard shortcuts, surfaced here so they are discoverable rather than buried in button tooltips. Grouped
// by area; each row renders its keys as <kbd> chips joined by "+".
type Shortcut = { keys: string[]; description: string };
type ShortcutGroup = { heading: string; shortcuts: Shortcut[] };

const SHORTCUT_GROUPS: ShortcutGroup[] = [
    {
        heading: 'Editing',
        shortcuts: [
            { keys: [MOD, 'S'], description: 'Save the current file' }
        ]
    },
    {
        heading: 'Tabs',
        shortcuts: [
            { keys: [MOD, 'Shift', 'T'], description: 'Reopen the last closed tab' },
            { keys: ['Arrow keys'], description: 'Move between tabs (when a tab has focus)' },
            { keys: ['Home'], description: 'Jump to the first tab (when a tab has focus)' }
        ]
    },
    {
        heading: 'Activity',
        shortcuts: [
            { keys: [MOD, 'Enter'], description: 'Send a message in an activity chat' }
        ]
    },
    {
        heading: 'General',
        shortcuts: [
            { keys: ['Esc'], description: 'Close a dialog, menu, or clear the search box' },
            { keys: ['?'], description: 'Show this shortcuts help' }
        ]
    }
];

const ShortcutsDialog = function ({ open, onClose }: { open: boolean; onClose: () => void }) {
    return (
        <ResponsiveDialog open={open} onClose={onClose} title="Keyboard shortcuts" maxWidthWhenNotFullScreen={460} noPrimaryButton>
            <div className={styles.shortcuts}>
                {SHORTCUT_GROUPS.map(function (group) {
                    return (
                        <section key={group.heading} className={styles.group}>
                            <h3 className={styles.groupHeading}>{group.heading}</h3>
                            <dl className={styles.list}>
                                {group.shortcuts.map(function (shortcut) {
                                    return (
                                        <div key={shortcut.description} className={styles.row}>
                                            <dt className={styles.keys}>
                                                {shortcut.keys.map(function (key, index) {
                                                    return (
                                                        <span key={key}>
                                                            {index > 0 && <span className={styles.plus}>+</span>}
                                                            <kbd className={styles.kbd}>{key}</kbd>
                                                        </span>
                                                    );
                                                })}
                                            </dt>
                                            <dd className={styles.description}>{shortcut.description}</dd>
                                        </div>
                                    );
                                })}
                            </dl>
                        </section>
                    );
                })}
            </div>
        </ResponsiveDialog>
    );
};

export { ShortcutsDialog };
