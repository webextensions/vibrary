import { useEffect, useRef, useState } from 'react';

import { getWorkspace } from './api.ts';
import { readSessionTabs, writeSessionTabs } from './sessionTabs.ts';

type SessionRestoreOptions = {
    // The current listing plus whether its FIRST load has landed - restoring filters the stored paths against a real
    // listing, never the initial empty array (which would silently drop every stored tab).
    files: string[];
    listingLoaded: boolean;
    tabs: { path: string; kind: 'file' | 'activity' }[];
    activePath: string | null;
    openOrFocus: (path: string) => void;
    setActive: (path: string) => void;
    // Reports into the app's error banner (the file-operations hook owns it).
    reportError: (message: string) => void
};

// Owns which-tabs-were-open persistence, extracted from App along the useOpenTabs/useFileOperations seam: resolve the
// served folder (tab sessions are scoped per folder), restore that folder's stored tabs once the real listing is
// known, then persist the open set on every change. Self-contained - App only mounts it.
const useSessionRestore = function ({ files, listingLoaded, tabs, activePath, openOrFocus, setActive, reportError }: SessionRestoreOptions): void {
    // The served folder, used to scope which tabs are remembered across reloads. sessionReady gates persistence until
    // the one-time restore has run, so the initial empty tab list never overwrites a stored session.
    const [workspaceCwd, setWorkspaceCwd] = useState<string | null>(null);
    const [sessionReady, setSessionReady] = useState(false);

    useEffect(function () {
        let isCancelled = false;
        void (async function () {
            try {
                const cwd = await getWorkspace();
                if (!isCancelled) {
                    setWorkspaceCwd(cwd);
                }
            } catch (error) {
                // Without the folder identity, restore and persistence stay off for this session; the stored session
                // is preserved untouched.
                reportError(`Failed to load the workspace: ${(error as Error).message}`);
            }
        })();
        return function () {
            isCancelled = true;
        };
    }, [reportError]);

    // Reopen the folder's previously open tabs once - after both the folder identity and the first listing have
    // arrived - skipping any that no longer exist (deleted, or stored under a folder that happens to share this one's
    // key). openOrFocus fetches each tab's content on its own.
    const restoredReference = useRef(false);
    useEffect(function () {
        if (restoredReference.current || workspaceCwd === null || !listingLoaded) {
            return;
        }
        restoredReference.current = true;
        const record = readSessionTabs(workspaceCwd);
        if (record !== null) {
            const present = new Set(files);
            for (const path of record.paths) {
                if (present.has(path)) {
                    openOrFocus(path);
                }
            }
            if (record.activePath !== null && present.has(record.activePath)) {
                setActive(record.activePath);
            }
        }
        setSessionReady(true);
    }, [workspaceCwd, listingLoaded, files, openOrFocus, setActive]);

    // Persist the open set and active tab whenever they change, so a reload can restore them. The effect keys on a
    // signature of just the open paths, so per-tab edits (dirty/status/reloadNonce) that rebuild the tabs array do not
    // trigger redundant writes. Closing the last tab stores an empty set, which correctly restores to an empty editor.
    // Only file tabs are persisted; activity tabs are in-memory (their job lives in the queue, lost on refresh).
    const openSignature = tabs.filter(function (tab) { return tab.kind === 'file'; }).map(function (tab) { return tab.path; }).join('\n');
    useEffect(function () {
        if (!sessionReady || workspaceCwd === null) {
            return;
        }
        const paths = openSignature === '' ? [] : openSignature.split('\n');
        const persistedActive = activePath !== null && paths.includes(activePath) ? activePath : null;
        writeSessionTabs(workspaceCwd, { paths, activePath: persistedActive });
    }, [openSignature, activePath, sessionReady, workspaceCwd]);
};

export { useSessionRestore };
