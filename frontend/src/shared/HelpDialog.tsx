import { type AnchorHTMLAttributes, lazy, Suspense, useEffect, useState } from 'react';

import { getManualPage, getVersion } from '../api.ts';
import { ResponsiveDialog } from './ResponsiveDialog.tsx';

import styles from './HelpDialog.module.css';

// Load the Markdown renderer on demand, the same treatment SpecCard gives it: the remark/micromark stack is a
// sizeable chunk and most Help opens stay on the Shortcuts tab. lazy() wants a default export; react-markdown has one.
const ReactMarkdown = lazy(function () {
    return import('react-markdown');
});

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
            { keys: ['Home', 'End'], description: 'Jump to the first / last tab (when a tab has focus)' }
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
            { keys: ['Esc'], description: 'Close a dialog or menu; with none open, clear the entry or file selection' },
            { keys: ['?'], description: 'Show this help' }
        ]
    }
];

// The shipped manual pages the Guide tab offers, in reading order. `name` is the key of the backend's allowlist
// (backend/documentation/documentation.js) - the docs are served from the installed package, so they are present for installed users
// too, not only when running from the repo.
const GUIDE_PAGES = [
    { name: 'README.md', label: 'Overview' },
    { name: 'editor.md', label: 'Editor guide' },
    { name: 'vibrary-file-format.md', label: 'File format' }
];

type HelpTab = 'shortcuts' | 'guide';

const HelpDialog = function ({ open, onClose }: { open: boolean; onClose: () => void }) {
    const [tab, setTab] = useState<HelpTab>('shortcuts');
    const [pageName, setPageName] = useState(GUIDE_PAGES[0].name);
    // Fetched pages, cached for the session - the manual does not change under a running server.
    const [loadedPages, setLoadedPages] = useState<Record<string, string>>({});
    const [pageError, setPageError] = useState<string | null>(null);

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

    // Fetch the selected guide page the first time it is shown. Object.hasOwn rather than a plain lookup so a page
    // named like an Object.prototype key could never read an inherited value - moot for the fixed GUIDE_PAGES names,
    // cheap to keep correct anyway.
    useEffect(function () {
        if (!open || tab !== 'guide' || Object.hasOwn(loadedPages, pageName)) {
            return undefined;
        }
        let isActive = true;
        const loadPageAsync = async function () {
            try {
                const content = await getManualPage(pageName);
                if (isActive) {
                    setPageError(null);
                    setLoadedPages(function (previous) {
                        return { ...previous, [pageName]: content };
                    });
                }
            } catch (error) {
                if (isActive) {
                    setPageError((error as Error).message);
                }
            }
        };
        void loadPageAsync();
        return function () {
            isActive = false;
        };
    }, [open, tab, pageName, loadedPages]);

    // The docs cross-link each other by bare file name ("[editor.md](editor.md)") and link out to the web. A doc-name
    // link switches the Guide page in place; an absolute link opens a new tab; anything else (in-page anchors,
    // repo-relative code paths) renders as plain text, since navigating the SPA there would just break.
    const renderLink = function ({ href, children }: AnchorHTMLAttributes<HTMLAnchorElement>) {
        const target = (href ?? '').split('#', 1)[0];
        const guidePage = GUIDE_PAGES.find(function (page) { return page.name === target; });
        if (guidePage !== undefined) {
            return (
                <button type="button" className={styles.pageLink} onClick={function () { setPageName(guidePage.name); }}>
                    {children}
                </button>
            );
        }
        if (/^https?:\/\//.test(href ?? '')) {
            return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
        }
        return <span>{children}</span>;
    };

    const guideContent = Object.hasOwn(loadedPages, pageName) ? loadedPages[pageName] : null;

    return (
        <ResponsiveDialog open={open} onClose={onClose} title="Help" maxWidthWhenNotFullScreen={tab === 'guide' ? 760 : 460} noPrimaryButton>
            <div className={styles.tabRow} role="tablist" aria-label="Help sections">
                <button type="button" role="tab" aria-selected={tab === 'shortcuts'} className={tab === 'shortcuts' ? styles.tabActive : styles.tab} onClick={function () { setTab('shortcuts'); }}>
                    Shortcuts
                </button>
                <button type="button" role="tab" aria-selected={tab === 'guide'} className={tab === 'guide' ? styles.tabActive : styles.tab} onClick={function () { setTab('guide'); }}>
                    Guide
                </button>
            </div>

            {tab === 'shortcuts' &&
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
            </div>}

            {tab === 'guide' &&
            <div className={styles.guide}>
                <div className={styles.pagePicker} role="tablist" aria-label="Guide pages">
                    {GUIDE_PAGES.map(function (page) {
                        return (
                            <button key={page.name} type="button" role="tab" aria-selected={pageName === page.name} className={pageName === page.name ? styles.tabActive : styles.tab} onClick={function () { setPageName(page.name); }}>
                                {page.label}
                            </button>
                        );
                    })}
                </div>
                {pageError !== null && <p className={styles.pageMessage}>Failed to load the guide: {pageError}</p>}
                {pageError === null && guideContent === null && <p className={styles.pageMessage}>Loading...</p>}
                {guideContent !== null &&
                <Suspense fallback={<p className={styles.pageMessage}>Loading...</p>}>
                    <div className={styles.guideBody}>
                        <ReactMarkdown components={{ a: renderLink }}>{guideContent}</ReactMarkdown>
                    </div>
                </Suspense>}
            </div>}

            {version !== null && <p className={styles.footer}>vibrary v{version}</p>}
        </ResponsiveDialog>
    );
};

export { HelpDialog };
