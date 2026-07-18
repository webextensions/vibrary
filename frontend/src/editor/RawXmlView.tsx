import { useMemo, useState } from 'react';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import markup from 'react-syntax-highlighter/dist/esm/languages/prism/markup.js';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism/index.js';
import { toast } from 'react-toastify';

import { confirmDialog } from '../shared/confirmDialog.ts';
import { copyText } from '../shared/copyText.ts';
import { CopyIcon, SaveIcon } from '../shared/Icons.tsx';
import { isStoredTrue, readStored, writeStored } from '../shared/storage.ts';
import { parseVibraryXml } from '../xml/vibraryXml.ts';

import styles from './RawXmlView.module.css';

// Syntax-highlighted XML pane for the Raw tab. The PrismLight build with only the `markup` grammar registered
// keeps highlighting synchronous and the bundle small - no async language loader and no WASM - so it stays fast even on
// large files, while pulling in just one language instead of Prism's full set.
//
// Read-only for a parseable file, EDITABLE while the file is broken (parseError set): the repair editor is the only
// route back from an unparseable file, and sending the user to an external editor was a dead end in a tool whose whole
// job is editing these files. The editable-only-while-broken rule is deliberate and firm - a raw edit to a parseable
// file would be laundered through the serializer on the next model save (the round-trip contract drops anything
// outside the schema), so two editable views of one working file is a data-loss trap, not a feature.

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
const WRAP_STORAGE_KEY = 'vibrary:raw-wrap';

type RawXmlViewProperties = {
    xml: string;
    // Non-null while the file failed to parse - which is exactly when the pane becomes editable.
    parseError?: string | null;
    // True while the repair save is in flight (the tab's saving status), disabling the Save button.
    saving?: boolean;
    // Write the repaired text verbatim (the caller owns the guarded save and the reload-on-success transition).
    onSaveRaw?: (rawText: string) => Promise<void>
};

const RawXmlView = function ({ xml, parseError = null, saving = false, onSaveRaw }: RawXmlViewProperties) {
    // markup is the only grammar this build needs; registering here is idempotent and cheap (the Raw pane re-renders
    // rarely), which keeps the side effect out of module scope where the lint config forbids it.
    SyntaxHighlighter.registerLanguage('markup', markup);

    // Seed from the persisted choice (default on).
    const [wrap, setWrap] = useState(function (): boolean {
        return readStored(WRAP_STORAGE_KEY, isStoredTrue, true);
    });

    const isEditable = parseError !== null && onSaveRaw !== undefined;
    // The repair draft, seeded from the broken on-disk text. The caller keys this component by path+reloadNonce, so a
    // tab switch or reload remounts it and the draft can never leak across files or survive a reload it should not.
    const [draft, setDraft] = useState(xml);

    // The live parse verdict as the user types - the same parser the app loads files with, running in the browser, so
    // "it parses here" and "it will parse on reload" can never disagree. Its message carries the failure position,
    // which is most of the value over a bare textarea.
    const liveParseError = useMemo(function (): string | null {
        if (!isEditable) {
            return null;
        }
        try {
            parseVibraryXml(draft);
            return null;
        } catch (error) {
            return (error as Error).message;
        }
    }, [isEditable, draft]);

    const toggleWrap = function () {
        const willWrap = !wrap;
        setWrap(willWrap);
        writeStored(WRAP_STORAGE_KEY, String(willWrap));
    };

    // Build codeTagProps fresh every render: SyntaxHighlighter mutates this object's `style` to set the wrap-driven
    // `whiteSpace`, spreading the prior value on top, so a shared object would pin the first wrap state for the session.
    // The <code> otherwise inherits the theme's own font; pull it back to the container's to match the rest of the UI.
    const codeTagProperties = { style: { fontFamily: 'inherit', fontSize: 'inherit' } };

    // Copy the whole file's XML to the clipboard. copyText falls back to the legacy path on a plain-HTTP LAN origin
    // (the phone case) where the async Clipboard API is unavailable.
    const handleCopy = async function () {
        const copied = await copyText(isEditable ? draft : xml);
        if (copied) {
            toast.success('Copied XML');
        } else {
            toast.error('Could not copy to the clipboard');
        }
    };

    // The backend writes whatever it is sent (it does not validate parseability - it is the user's file, and refusing
    // a partial fix mid-repair would be maddening), so saving still-broken text is allowed but never silent.
    const handleSave = async function () {
        if (onSaveRaw === undefined || saving) {
            return;
        }
        if (liveParseError !== null) {
            const confirmed = await confirmDialog('This text still does not parse - the file will stay broken after saving. Save anyway?', 'Save anyway');
            if (!confirmed) {
                return;
            }
        }
        await onSaveRaw(draft);
    };

    return (
        <div className={styles.rawPane}>
            <div className={styles.rawHeader}>
                {isEditable && (liveParseError === null ?
                    <span className={styles.parseStatusOk}>Parses cleanly - Save to return to the Structured editor.</span> :
                    <span className={styles.parseStatusBad} title={liveParseError}>Still invalid: {liveParseError}</span>)}
                {isEditable &&
                <button type="button" className={styles.copyButton} title="Write this text to the file verbatim" disabled={saving} onClick={handleSave}>
                    <SaveIcon />
                    {saving ? 'Saving...' : 'Save'}
                </button>}
                <button type="button" className={styles.copyButton} title="Copy the XML to the clipboard" onClick={handleCopy}>
                    <CopyIcon />
                    Copy
                </button>
                <label className={styles.wrapToggle}>
                    <input type="checkbox" checked={wrap} onChange={toggleWrap} />
                    Wrap
                </label>
            </div>
            {isEditable ?
                (
                    <textarea
                        className={styles.repairEditor}
                        aria-label="Repair the file's XML"
                        spellCheck={false}
                        wrap={wrap ? 'soft' : 'off'}
                        value={draft}
                        onChange={function (changeEvent) {
                            setDraft(changeEvent.target.value);
                        }}
                    />
                ) :
                (
                    <SyntaxHighlighter
                        language="markup"
                        style={oneLight}
                        customStyle={containerStyle}
                        codeTagProps={codeTagProperties}
                        wrapLongLines={wrap}
                    >
                        {xml}
                    </SyntaxHighlighter>
                )}
        </div>
    );
};

export { RawXmlView };
