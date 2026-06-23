import { useCallback, useEffect, useMemo, useState } from 'react';

import { getFile, listFiles, loadAllTruthTitles, saveFile } from './api.ts';
import { TruthsEditor } from './components/TruthsEditor.tsx';
import { parseTruthsXml, serializeTruthsXml, type Truth } from './truthsXml.ts';

type Status = { kind: 'idle' } | { kind: 'saving' } | { kind: 'error'; message: string };

type Tab = 'structured' | 'raw';

const App = function () {
    const [files, setFiles] = useState<string[]>([]);
    const [selected, setSelected] = useState<string | null>(null);
    const [truths, setTruths] = useState<Truth[]>([]);
    const [allTitles, setAllTitles] = useState<string[]>([]);
    const [rawFallback, setRawFallback] = useState<string>('');
    const [parseError, setParseError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<Tab>('structured');
    const [status, setStatus] = useState<Status>({ kind: 'idle' });
    const [dirty, setDirty] = useState<boolean>(false);
    const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);

    // Warn before the tab is closed or the page is navigated away while there are unsaved edits. Setting returnValue is
    // what makes the browser show its native "leave site?" confirmation, which lets the user cancel the navigation.
    useEffect(function () {
        if (!dirty) {
            return undefined;
        }
        const handleBeforeUnload = function (unloadEvent: BeforeUnloadEvent) {
            unloadEvent.preventDefault();
            unloadEvent.returnValue = '';
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return function () {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [dirty]);

    useEffect(function () {
        const loadAsync = async function () {
            try {
                setFiles(await listFiles());
                setAllTitles(await loadAllTruthTitles());
            } catch (error) {
                setStatus({ kind: 'error', message: (error as Error).message });
            }
        };
        void loadAsync();
    }, []);

    const openFile = useCallback(async function (name: string) {
        setSelected(name);
        setStatus({ kind: 'idle' });
        setDirty(false);
        setActiveTab('structured');
        setSidebarOpen(false); // close the mobile drawer after picking a file
        try {
            const content = await getFile(name);
            setRawFallback(content);
            setTruths(parseTruthsXml(content));
            setParseError(null);
        } catch (error) {
            setTruths([]);
            setParseError((error as Error).message);
        }
    }, []);

    // Raw tab shows the XML regenerated from the structured model (source of truth); on parse failure it shows the
    // original file content so the malformed XML is still visible.
    const rawXml = useMemo(function () {
        return parseError === null ? serializeTruthsXml(truths) : rawFallback;
    }, [parseError, truths, rawFallback]);

    const onSave = useCallback(async function () {
        if (!selected || parseError !== null) {
            return;
        }
        setStatus({ kind: 'saving' });
        try {
            await saveFile(selected, serializeTruthsXml(truths));
            setStatus({ kind: 'idle' });
            setDirty(false);
            setAllTitles(await loadAllTruthTitles());
        } catch (error) {
            setStatus({ kind: 'error', message: (error as Error).message });
        }
    }, [selected, truths, parseError]);

    const onTruthsChange = useCallback(function (next: Truth[]) {
        setTruths(next);
        setStatus({ kind: 'idle' });
        setDirty(true);
    }, []);

    return (
        <div className="layout">
            {sidebarOpen &&
            <div
                className="sidebar-overlay"
                onClick={function () {
                    setSidebarOpen(false);
                }}
            />}

            <aside className={sidebarOpen ? 'sidebar open' : 'sidebar'}>
                <h1>truths</h1>
                {files.length === 0 ?
                    (
                        <p className="empty">No truths.xml or truths-*.xml files in this folder.</p>
                    ) :
                    (
                        <ul>
                            {files.map(function (name) {
                                return (
                                    <li key={name}>
                                        <button
                                            type="button"
                                            className={name === selected ? 'active' : ''}
                                            onClick={function () {
                                                void openFile(name);
                                            }}
                                        >
                                            {name}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
            </aside>

            <main className="editor">
                <button
                    type="button"
                    className="menu-toggle"
                    aria-label="Toggle file list"
                    onClick={function () {
                        setSidebarOpen(function (open) {
                            return !open;
                        });
                    }}
                >
                    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                        <path
                            d="M3 5h14M3 10h14M3 15h14"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                        />
                    </svg>
                </button>
                {selected ?
                    (
                        <>
                            <div className="toolbar">
                                <div className="tabs">
                                    <button
                                        type="button"
                                        className={activeTab === 'structured' ? 'active' : ''}
                                        onClick={function () {
                                            setActiveTab('structured');
                                        }}
                                    >
                                        Structured
                                    </button>
                                    <button
                                        type="button"
                                        className={activeTab === 'raw' ? 'active' : ''}
                                        onClick={function () {
                                            setActiveTab('raw');
                                        }}
                                    >
                                        Raw
                                    </button>
                                </div>
                                <span className="filename">{selected}</span>
                                <button
                                    type="button"
                                    className="save"
                                    onClick={onSave}
                                    disabled={status.kind === 'saving' || !dirty || parseError !== null}
                                >
                                    {status.kind === 'saving' ?
                                        <span className="spinner" role="status" aria-label="Saving" /> :
                                        (dirty ? 'Save' : 'Saved')}
                                </button>
                                {status.kind === 'error' && <span className="err">{status.message}</span>}
                            </div>

                            {parseError !== null &&
                            <p className="err parse-error">Could not parse XML: {parseError}. Fix the file, then reopen it.</p>}

                            {activeTab === 'structured' && parseError === null ?
                                (
                                    <TruthsEditor
                                        key={selected}
                                        truths={truths}
                                        allTitles={allTitles}
                                        onChange={onTruthsChange}
                                    />
                                ) :
                                (
                                    <textarea className="raw-view" value={rawXml} readOnly spellCheck={false} />
                                )}
                        </>
                    ) :
                    (
                        <p className="placeholder">Select a file to edit.</p>
                    )}
            </main>
        </div>
    );
};

export { App };
