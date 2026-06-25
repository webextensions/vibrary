import { useCallback, useEffect, useState } from 'react';

import { getApprovalCount } from './api.ts';
import { countApprovedTruths, type Truth } from './runbooksXml.ts';

// Per-file approved/total tally shown in the sidebar; loaded lazily, so each file is 'loading' until its count arrives.
type FileCount = { kind: 'loading' } | { kind: 'ready'; approved: number; total: number } | { kind: 'error' };

// An open tab whose tally is derived from its live in-memory model rather than a fetch.
type OpenTab = { path: string; truths: Truth[]; parseError: string | null };

// Owns the sidebar's approved/total tallies: loads them lazily for every file, keeps every open tab's badge in sync with
// unsaved edits, and lets a save record its just-written count so the badge stays right after switching away.
const useFileCounts = function (files: string[], openTabs: OpenTab[]) {
    const [fileCounts, setFileCounts] = useState<Record<string, FileCount>>({});

    // Tally each file's approved/total counts for the sidebar overview. Files are fetched one at a time so the counts
    // fill in progressively rather than firing a burst of requests, and a single unreadable file only marks itself.
    useEffect(function () {
        if (files.length === 0) {
            return undefined;
        }
        // Files with no entry yet render as 'loading' via countForFile, so there is no need to pre-seed that state here.
        let isCancelled = false;
        const loadAsync = async function () {
            for (const name of files) {
                let next: FileCount;
                try {
                    next = { kind: 'ready', ...await getApprovalCount(name) };
                } catch {
                    next = { kind: 'error' };
                }
                if (isCancelled) {
                    return;
                }
                setFileCounts(function (previous) {
                    return { ...previous, [name]: next };
                });
            }
        };
        void loadAsync();
        return function () {
            isCancelled = true;
        };
    }, [files]);

    // Record a file's tally directly from its model (called after a save) so its badge stays correct once it is no
    // longer the open file and countForFile falls back to this stored value.
    const markCounted = useCallback(function (name: string, truths: Truth[]) {
        setFileCounts(function (previous) {
            return { ...previous, [name]: { kind: 'ready', approved: countApprovedTruths(truths), total: truths.length } };
        });
    }, []);

    // An open tab's count reflects unsaved in-memory edits so approving/unapproving updates the badge live; files with no
    // open tab use their last-loaded tally.
    const countForFile = function (name: string): FileCount {
        const open = openTabs.find(function (tab) {
            return tab.path === name;
        });
        if (open !== undefined && open.parseError === null) {
            return { kind: 'ready', approved: countApprovedTruths(open.truths), total: open.truths.length };
        }
        return fileCounts[name] ?? { kind: 'loading' };
    };

    return { countForFile, markCounted };
};

export { type FileCount, useFileCounts };
