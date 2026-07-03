import { useCallback, useState } from 'react';

import { type FileSummary } from './api.ts';
import { countApprovedSpecs, type Spec } from './vibraryXml.ts';

// Per-file approved/total tally shown in the sidebar; 'loading' until the workspace summary arrives, 'error' for a
// file the server could not read/parse.
type FileCount = { kind: 'loading' } | { kind: 'ready'; approved: number; total: number } | { kind: 'error' };

// An open tab whose tally is derived from its live in-memory model rather than the summary.
type OpenTab = { path: string; specs: Spec[]; parseError: string | null };

// Owns the sidebar's approved/total tallies. The numbers come from the one-request workspace summary the listing
// already fetches (previously each file's FULL content was re-downloaded just to derive two integers); an open tab's
// badge is derived live from its in-memory model so unsaved edits show immediately, and a save can record its
// just-written tally via markCounted so the badge stays right in the window before the next summary refresh lands.
const useFileCounts = function (summaries: FileSummary[], openTabs: OpenTab[]) {
    const [savedCounts, setSavedCounts] = useState<Record<string, { approved: number; total: number }>>({});

    // A fresh summary supersedes every recorded save (the refresh a save triggers reads the file back), so drop the
    // overrides - otherwise a later external edit could lose to a stale remembered tally. Adjusted during render (the
    // React-recommended alternative to a setState effect), keyed on the summaries identity.
    const [seenSummaries, setSeenSummaries] = useState(summaries);
    if (seenSummaries !== summaries) {
        setSeenSummaries(summaries);
        setSavedCounts({});
    }

    // Record a file's tally directly from its model (called after a save) so its badge stays correct once it is no
    // longer the open file and countForFile falls back to this stored value.
    const markCounted = useCallback(function (name: string, specs: Spec[]) {
        setSavedCounts(function (previous) {
            return { ...previous, [name]: { approved: countApprovedSpecs(specs), total: specs.length } };
        });
    }, []);

    // An open tab's count reflects unsaved in-memory edits so approving/unapproving updates the badge live; files with
    // no open tab use the recorded save, then the summary.
    const countForFile = function (name: string): FileCount {
        const open = openTabs.find(function (tab) {
            return tab.path === name;
        });
        if (open !== undefined && open.parseError === null) {
            return { kind: 'ready', approved: countApprovedSpecs(open.specs), total: open.specs.length };
        }
        const saved = savedCounts[name];
        if (saved !== undefined) {
            return { kind: 'ready', ...saved };
        }
        const summary = summaries.find(function (file) {
            return file.name === name;
        });
        if (summary === undefined) {
            return { kind: 'loading' };
        }
        return summary.approved === null || summary.total === null ?
            { kind: 'error' } :
            { kind: 'ready', approved: summary.approved, total: summary.total };
    };

    return { countForFile, markCounted };
};

export { type FileCount, useFileCounts };
