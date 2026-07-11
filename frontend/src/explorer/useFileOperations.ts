import { useCallback, useEffect, useState } from 'react';

import { type Backlinks, createFile, createVibraryInclude, deleteFile, duplicateFile, type FileSummary, getFilesSummary, renameFile, type TitleIndexEntry } from '../api.ts';
import { confirmDialog } from '../shared/confirmDialog.ts';
import { countBreakingReferences } from './breakingReferences.ts';
import { collectFilePaths, type TreeNode } from './fileTree.ts';
import { promptDialog } from '../shared/promptDialog.ts';

// Build the title -> file index from the workspace summary: first occurrence wins for a duplicated title, and the
// summary lists files in listing order, so which file wins is deterministic across refreshes.
const deriveTitleIndex = function (files: FileSummary[]): TitleIndexEntry[] {
    const seen = new Set<string>();
    const index: TitleIndexEntry[] = [];
    const add = function (title: string, path: string) {
        if (seen.has(title)) {
            return;
        }
        seen.add(title);
        index.push({ title, path });
    };
    for (const file of files) {
        for (const title of file.titles) {
            add(title, file.name);
        }
    }
    return index.toSorted(function (a, b) {
        return a.title.localeCompare(b.title);
    });
};

type FileOperationsOptions = {
    // The open tabs, for the rename flow's dirty check (renaming closes and reopens affected tabs).
    tabs: { path: string; dirty: boolean }[];
    closeTab: (path: string) => void;
    openOrFocus: (path: string) => void;
    // Open a just-created file the way the sidebar does (focus it and close the mobile drawer).
    onFileOpened: (name: string) => void
};

// Owns the workspace listing (files, summaries, title index, .vibraryinclude presence) and every explorer file
// mutation - add, new-in-folder, delete, bulk delete, rename, duplicate, include-bootstrap - plus the error banner
// state they report into. Extracted from App along the same seam as useOpenTabs/useFileCounts: one concern, a narrow
// return surface.
const useFileOperations = function ({ tabs, closeTab, openOrFocus, onFileOpened }: FileOperationsOptions) {
    const [files, setFiles] = useState<string[]>([]);
    // The workspace summary the listing fetch returns: per-file titles and approved/total tallies, feeding both the
    // title index and useFileCounts without any per-file re-downloads.
    const [fileSummaries, setFileSummaries] = useState<FileSummary[]>([]);
    // Folder-wide reverse-reference map (target title -> entries pointing at it), backing each card's "Referenced by"
    // section. Saved-state, like fileSummaries; the editor merges the open file's live references over it.
    const [backlinks, setBacklinks] = useState<Backlinks>({});
    // Whether a ".vibraryinclude" file exists at all, so the explorer's empty state can tell "nothing included yet
    // because no .vibraryinclude exists" apart from "a .vibraryinclude exists but its patterns match nothing".
    const [hasVibraryInclude, setHasVibraryInclude] = useState(true);
    // Every entry title across every vibrary file, paired with which file it lives in - backs both the "Relates to"
    // option list and resolving a clicked "Relates to" chip to its target file.
    const [titleIndex, setTitleIndex] = useState<TitleIndexEntry[]>([]);
    // Errors from loading the listing or from a file mutation, shown as the dismissable banner above the editor.
    const [loadError, setLoadError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    // True once the FIRST listing has landed successfully; useSessionRestore gates on it so stored tabs are filtered
    // against a real listing (and a failed startup never persists an empty session over the stored one).
    const [listingLoaded, setListingLoaded] = useState(false);

    const clearLoadError = useCallback(function () {
        setLoadError(null);
    }, []);

    // For sibling hooks (session restore) that report into the same banner.
    const reportLoadError = useCallback(function (message: string) {
        setLoadError(message);
    }, []);

    // Re-fetch the workspace summary - one request carrying the listing, every file's titles, and the badge tallies -
    // so the explorer reflects what is actually on disk. Every file-mutation handler funnels through here - including
    // after FAILED mutations (from a finally): a partial bulk delete has already removed some files, and keeping them
    // listed as ghosts until a manual Refresh misleads worse than the error itself. Never throws; a listing failure
    // lands in the banner and reports false so callers know not to clear an earlier, more specific error.
    const refreshListing = useCallback(async function (): Promise<boolean> {
        try {
            const summary = await getFilesSummary();
            setFiles(summary.files.map(function (file) { return file.name; }));
            setFileSummaries(summary.files);
            setBacklinks(summary.backlinks);
            setHasVibraryInclude(summary.hasVibraryInclude);
            setTitleIndex(deriveTitleIndex(summary.files));
            return true;
        } catch (error) {
            setLoadError(`Failed to load the file listing: ${(error as Error).message}`);
            return false;
        }
    }, []);

    // The initial load is the same request as every later refresh.
    useEffect(function () {
        void (async function () {
            if (await refreshListing()) {
                setListingLoaded(true);
            }
        })();
    }, [refreshListing]);

    // The sidebar's refresh button: reload the file list and every entry title from disk, picking up files added or
    // changed outside the app.
    const handleRefresh = useCallback(async function () {
        setRefreshing(true);
        try {
            if (await refreshListing()) {
                setLoadError(null);
            }
        } finally {
            setRefreshing(false);
        }
    }, [refreshListing]);

    // One create flow behind both entry points: prompt for a name (joined onto `folderPath` when given), create the
    // empty file on the server, then refresh the list and open it. The name must match the vibrary naming convention
    // (<family>.xml or <family>-<name>.xml, where family is reviews/specs/tasks/ideas); the server validates and
    // surfaces any problem (bad name, already exists) as the load-error banner.
    const promptAndCreateFile = useCallback(async function (folderPath?: string) {
        const name = await promptDialog({
            message: folderPath === undefined ?
                'New file name (e.g. specs.xml, reviews-<name>.xml, tasks-<name>.xml, ideas-<name>.xml):' :
                `New file in "${folderPath}" (e.g. specs.xml, reviews-<name>.xml, tasks-<name>.xml, ideas-<name>.xml):`,
            placeholder: 'specs-<name>.xml',
            confirmLabel: 'Create'
        });
        if (name === null) {
            return;
        }
        const fullName = folderPath === undefined ? name : `${folderPath}/${name}`;
        try {
            await createFile(fullName);
            if (await refreshListing()) {
                setLoadError(null);
            }
            onFileOpened(fullName);
        } catch (error) {
            setLoadError(`Failed to create "${fullName}": ${(error as Error).message}`);
        }
    }, [onFileOpened, refreshListing]);

    // The sidebar's add button. Wrapped (not promptAndCreateFile directly) so a click event can never be mistaken for
    // a folder path.
    const handleAddFile = useCallback(function () {
        return promptAndCreateFile();
    }, [promptAndCreateFile]);

    // The explorer "More" menu's New File action on a folder: the entered name is the file's basename (or a deeper
    // relative path) inside that folder.
    const handleNewFile = useCallback(function (folderPath: string) {
        return promptAndCreateFile(folderPath);
    }, [promptAndCreateFile]);

    // The explorer empty state's one-click bootstrap: write the starter .vibraryinclude, then refresh so the newly
    // included files (or the still-empty-but-now-configured state) appear. Without an include file NOTHING is
    // included - even "+" dead-ends - so this is the first-run way out.
    const handleCreateInclude = useCallback(async function () {
        try {
            await createVibraryInclude();
            if (await refreshListing()) {
                setLoadError(null);
            }
        } catch (error) {
            setLoadError(`Failed to create .vibraryinclude: ${(error as Error).message}`);
        }
    }, [refreshListing]);

    // The explorer "More" menu's Delete action. Folders have no on-disk entity (they are derived from file paths), so
    // deleting one removes every file beneath it; a file deletes just itself. Warn before the irreversible delete, then
    // remove the files, close any open tabs for them, and refresh the list and title pool.
    // A suffix for the delete confirmation warning that N cross-file relatesTo references will break, or '' when none
    // would. Reads the last-saved summary + backlinks map (the same data the editor's broken-reference surfacing uses),
    // so it is exact for saved state - the common case when deleting a file - and silent when there is nothing to warn.
    const breakingReferenceWarning = useCallback(function (paths: string[]): string {
        const count = countBreakingReferences(paths, fileSummaries, backlinks);
        if (count === 0) {
            return '';
        }
        return ` ${count} reference${count === 1 ? '' : 's'} from other files will break.`;
    }, [fileSummaries, backlinks]);

    const handleDelete = useCallback(async function (node: TreeNode) {
        const paths = collectFilePaths(node);
        const target = node.kind === 'folder' ?
            `folder "${node.path}" and its ${paths.length} file${paths.length === 1 ? '' : 's'}` :
            `"${node.path}"`;
        const confirmed = await confirmDialog(`Delete ${target}? This cannot be undone.${breakingReferenceWarning(paths)}`, 'Delete');
        if (!confirmed) {
            return;
        }
        try {
            for (const path of paths) {
                try {
                    await deleteFile(path);
                } catch (error) {
                    // Name the failing file: a folder delete may have already removed earlier files, and the raw
                    // server message alone does not say which one stopped the run.
                    setLoadError(`Failed to delete "${path}": ${(error as Error).message}`);
                    return;
                }
                closeTab(path);
            }
            setLoadError(null);
        } finally {
            // Refresh even after a failure: files deleted before the error are really gone.
            await refreshListing();
        }
    }, [breakingReferenceWarning, closeTab, refreshListing]);

    // The Explorer's bulk-select footer Delete button: same warn-then-delete-then-refresh shape as handleDelete above,
    // but over an arbitrary multi-file selection instead of one node's subtree. Resolves whether the user confirmed, so
    // the sidebar knows whether to clear its selection (kept intact on cancel).
    const handleBulkDelete = useCallback(async function (paths: string[]): Promise<boolean> {
        if (paths.length === 0) {
            return false;
        }
        const confirmed = await confirmDialog(`Delete ${paths.length} file${paths.length === 1 ? '' : 's'}? This cannot be undone.${breakingReferenceWarning(paths)}`, 'Delete');
        if (!confirmed) {
            return false;
        }
        try {
            for (const path of paths) {
                try {
                    await deleteFile(path);
                } catch (error) {
                    setLoadError(`Failed to delete "${path}": ${(error as Error).message}`);
                    return true;
                }
                closeTab(path);
            }
            setLoadError(null);
        } finally {
            // Refresh even after a failure: files deleted before the error are really gone.
            await refreshListing();
        }
        return true;
    }, [breakingReferenceWarning, closeTab, refreshListing]);

    // The explorer "More" menu's Rename action. A file renames (or moves - the new name may point into another folder)
    // just itself; a folder renames every file beneath it, since folders have no on-disk entity of their own. Open tabs
    // are keyed by path, so affected tabs are closed and the file reopened under its new name - which drops unsaved
    // edits, hence the extra confirmation when any affected tab is dirty.
    const handleRename = useCallback(async function (node: TreeNode) {
        const isFolder = node.kind === 'folder';
        const entered = await promptDialog({
            message: isFolder ? `Rename folder "${node.path}" to:` : `Rename "${node.path}" to:`,
            confirmLabel: 'Rename',
            initialValue: node.path
        });
        if (entered === null || entered === node.path) {
            return;
        }
        const renames = isFolder ?
            collectFilePaths(node).map(function (path) {
                return { from: path, to: `${entered}${path.slice(node.path.length)}` };
            }) :
            [{ from: node.path, to: entered }];
        const anyDirtyAffected = renames.some(function ({ from }) {
            return tabs.some(function (tab) {
                return tab.path === from && tab.dirty;
            });
        });
        if (anyDirtyAffected) {
            const confirmed = await confirmDialog('Renaming reopens the file from disk, so its unsaved changes will be lost. Continue?', 'Rename');
            if (!confirmed) {
                return;
            }
        }
        try {
            for (const { from, to } of renames) {
                try {
                    await renameFile(from, to);
                } catch (error) {
                    setLoadError(`Failed to rename "${from}" to "${to}": ${(error as Error).message}`);
                    return;
                }
                closeTab(from);
            }
            setLoadError(null);
            if (!isFolder) {
                openOrFocus(entered);
            }
        } finally {
            // Refresh even after a failure: a folder rename may have already moved earlier files.
            await refreshListing();
        }
    }, [tabs, closeTab, openOrFocus, refreshListing]);

    // The explorer "More" menu's Duplicate action: copy a file's on-disk content under a new name, leaving the source
    // untouched, then open the copy. Files only - folders have no single on-disk entity to copy (unlike rename/delete,
    // which recurse over every file beneath a folder).
    const handleDuplicate = useCallback(async function (node: TreeNode) {
        const entered = await promptDialog({
            message: `Duplicate "${node.path}" as:`,
            confirmLabel: 'Duplicate',
            initialValue: node.path
        });
        if (entered === null || entered === node.path) {
            return;
        }
        try {
            await duplicateFile(node.path, entered);
            if (await refreshListing()) {
                setLoadError(null);
            }
            openOrFocus(entered);
        } catch (error) {
            setLoadError(`Failed to duplicate "${node.path}": ${(error as Error).message}`);
        }
    }, [openOrFocus, refreshListing]);

    return {
        files,
        fileSummaries,
        backlinks,
        hasVibraryInclude,
        titleIndex,
        loadError,
        clearLoadError,
        reportLoadError,
        refreshing,
        listingLoaded,
        refreshListing,
        handleRefresh,
        handleAddFile,
        handleNewFile,
        handleCreateInclude,
        handleDelete,
        handleBulkDelete,
        handleRename,
        handleDuplicate
    };
};

export { useFileOperations };
