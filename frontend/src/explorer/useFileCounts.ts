import { useCallback, useMemo, useState } from 'react';

import { type FileSummary } from '../api.ts';
import { countApprovedSpecs, type Spec } from '../xml/vibraryXml.ts';

// Per-file approved/total tally shown in the sidebar; 'loading' until the workspace summary arrives, 'error' for a
// file the server could not read/parse. `brokenReferences` is that file's count of dangling relatesTo references
// (targets that resolve to no entry folder-wide): computed live from an open tab's model so it tracks unsaved edits
// like the rest of its badge, and taken from the summary for a file with no open tab.
type FileCount = { kind: 'loading' } | { kind: 'ready'; approved: number; total: number; brokenReferences: number } | { kind: 'error' };

// An open tab whose tally is derived from its live in-memory model rather than the summary.
type OpenTab = { path: string; specs: Spec[]; parseError: string | null };

// Count the dangling relatesTo references across `specs` - occurrences whose target title exists nowhere. The known set
// is every title saved folder-wide plus this file's own live titles, matching how a relatesTo reference resolves (and
// the editor's own dangling-reference check); the total (not distinct) count mirrors the backend summary.
const countLiveBrokenReferences = function (specs: Spec[], savedTitles: Set<string>): number {
    const known = new Set(savedTitles);
    for (const spec of specs) {
        known.add(spec.title);
    }
    let broken = 0;
    for (const spec of specs) {
        broken += spec.relatesTo.filter(function (reference) { return !known.has(reference); }).length;
    }
    return broken;
};

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

    // Every title saved across the folder, so an open tab's live broken-reference count can resolve references against
    // the same folder-wide set the backend uses (plus the file's own live titles, added per file below).
    const allSavedTitles = useMemo(function () {
        return new Set(summaries.flatMap(function (file) { return file.titles; }));
    }, [summaries]);

    // An open tab's count reflects unsaved in-memory edits so approving/unapproving updates the badge live; files with
    // no open tab use the recorded save, then the summary.
    const countForFile = function (name: string): FileCount {
        const summary = summaries.find(function (file) {
            return file.name === name;
        });
        // A file with no open tab shows the summary's broken-reference count (null - an unreadable file - contributes 0,
        // though such files render as 'error' anyway); an open tab computes it live just below.
        const brokenReferences = summary?.brokenReferences ?? 0;
        const open = openTabs.find(function (tab) {
            return tab.path === name;
        });
        if (open !== undefined && open.parseError === null) {
            return { kind: 'ready', approved: countApprovedSpecs(open.specs), total: open.specs.length, brokenReferences: countLiveBrokenReferences(open.specs, allSavedTitles) };
        }
        const saved = savedCounts[name];
        if (saved !== undefined) {
            return { kind: 'ready', ...saved, brokenReferences };
        }
        if (summary === undefined) {
            return { kind: 'loading' };
        }
        return summary.approved === null || summary.total === null ?
            { kind: 'error' } :
            { kind: 'ready', approved: summary.approved, total: summary.total, brokenReferences };
    };

    return { countForFile, markCounted };
};

export { type FileCount, useFileCounts };
