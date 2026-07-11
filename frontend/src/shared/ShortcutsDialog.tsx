import { useEffect, useState } from 'react';

import { getVersion } from '../api.ts';
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
            { keys: [MOD, 'S'], description: 'Save the current file' },
            { keys: ['/'], description: 'Filter the entries by text (not while typing)' }
        ]
    },
    {
        // The cohesive keyboard workflow for the entry list: move focus between cards, then act on the focused one.
        // They all share the "ignored while typing" caveat, so it lives once in the heading instead of on every row.
        heading: 'Entry cards (not while typing in a field)',
        shortcuts: [
            { keys: ['Alt', 'Up'], description: 'Move to the previous entry card' },
            { keys: ['Alt', 'Down'], description: 'Move to the next entry card' },
            { keys: ['Home', 'End'], description: 'Jump to the first / last entry card' },
            { keys: ['Alt', 'Shift', 'Up'], description: 'Move the focused entry up (file order only)' },
            { keys: ['Alt', 'Shift', 'Down'], description: 'Move the focused entry down (file order only)' },
            { keys: ['A'], description: 'Approve / reapprove the focused entry' },
            { keys: ['E'], description: 'Edit / stop editing the focused entry' },
            { keys: ['C'], description: 'Copy the focused entry as Markdown' },
            { keys: ['D'], description: 'Duplicate the focused entry' }
        ]
    },
    {
        heading: 'Navigation',
        shortcuts: [
            { keys: [MOD, 'K'], description: 'Quick-open a file or entry by name' },
            { keys: ['Up', 'Down'], description: 'Move between results in the Search panel (Enter opens)' },
            { keys: ['Alt', 'Left'], description: 'Back: retrace a "Relates to" / "Referenced by" jump' }
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
    // Fetch the running server's version the first time the dialog opens (this doubles as the app's "about" surface),
    // then keep it. A fetch failure just leaves the footer hidden rather than surfacing an error in a help dialog.
    const [version, setVersion] = useState<string | null>(null);
    useEffect(function () {
        if (!open || version !== null) {
            return undefined;
        }
        let isActive = true;
        const loadVersionAsync = async function () {
            try {
                const fetched = await getVersion();
                if (isActive) {
                    setVersion(fetched);
                }
            } catch {
                // ignore - the footer stays hidden on failure
            }
        };
        void loadVersionAsync();
        return function () {
            isActive = false;
        };
    }, [open, version]);

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
            {version !== null && <p className={styles.footer}>vibrary v{version}</p>}
        </ResponsiveDialog>
    );
};

export { ShortcutsDialog };
