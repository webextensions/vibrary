import { useState } from 'react';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import markup from 'react-syntax-highlighter/dist/esm/languages/prism/markup.js';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism/index.js';

import styles from './RawXmlView.module.css';

// Read-only, syntax-highlighted XML pane for the Raw tab. The PrismLight build with only the `markup` grammar registered
// keeps highlighting synchronous and the bundle small - no async language loader and no WASM - so it stays fast even on
// large files, while pulling in just one language instead of Prism's full set.

// The Prism theme styles the <pre> with inline styles, which beat CSS classes, so the layout that has to match the
// editor's textarea (fill the height, scroll, app monospace stack) is passed through here rather than index.css.
const containerStyle = {
    flex: 1,
    minHeight: 0,
    margin: 0,
    padding: '12px',
    border: '1px solid #d0d7de',
    borderRadius: '6px',
    background: '#f6f8fa',
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
    fontSize: '14px',
    lineHeight: 1.5,
    overflow: 'auto'
};

// Persist the line-wrap choice so it survives reloads and new sessions. Defaults to wrapping when nothing is stored.
const WRAP_STORAGE_KEY = 'runbooks:raw-wrap';

const RawXmlView = function ({ xml }: { xml: string }) {
    // markup is the only grammar this build needs; registering here is idempotent and cheap (the Raw pane re-renders
    // rarely), which keeps the side effect out of module scope where the lint config forbids it.
    SyntaxHighlighter.registerLanguage('markup', markup);

    // Seed from the persisted choice (default on). localStorage can throw when blocked, so fall back to the default.
    const [wrap, setWrap] = useState(function (): boolean {
        try {
            const stored = window.localStorage.getItem(WRAP_STORAGE_KEY);
            return stored === null ? true : stored === 'true';
        } catch {
            return true;
        }
    });

    const toggleWrap = function () {
        const willWrap = !wrap;
        setWrap(willWrap);
        try {
            window.localStorage.setItem(WRAP_STORAGE_KEY, String(willWrap));
        } catch {
            // ignore persistence failures; the toggle still works for this session
        }
    };

    // Build codeTagProps fresh every render: SyntaxHighlighter mutates this object's `style` to set the wrap-driven
    // `whiteSpace`, spreading the prior value on top, so a shared object would pin the first wrap state for the session.
    // The <code> otherwise inherits the theme's own font; pull it back to the container's to match the rest of the UI.
    const codeTagProperties = { style: { fontFamily: 'inherit', fontSize: 'inherit' } };

    return (
        <div className={styles.rawPane}>
            <label className={styles.wrapToggle}>
                <input type="checkbox" checked={wrap} onChange={toggleWrap} />
                Wrap
            </label>
            <SyntaxHighlighter
                language="markup"
                style={oneLight}
                customStyle={containerStyle}
                codeTagProps={codeTagProperties}
                wrapLongLines={wrap}
            >
                {xml}
            </SyntaxHighlighter>
        </div>
    );
};

export { RawXmlView };
