import { approvalState, type Spec } from '../xml/vibraryXml.ts';

// The board's column model, derived entirely from fields entries already have (type + the approval hash) - no new
// XML fields, so the board is a VIEW of the folder, never a second source of truth. Ideas get their own column
// regardless of approval (an idea is pre-work by nature); everything else buckets by the same three-way approval
// answer the editor's Approve button speaks.

type BoardColumn = 'idea' | 'draft' | 'approved' | 'stale';

// Column order and headings, in workflow order: raw ideas, drafts awaiting sign-off, signed-off entries, and
// approvals gone stale (content changed since sign-off - the same amber state the editor's Reapprove button shows).
const BOARD_COLUMNS: { key: BoardColumn; label: string }[] = [
    { key: 'idea', label: 'Ideas' },
    { key: 'draft', label: 'Draft' },
    { key: 'approved', label: 'Approved' },
    { key: 'stale', label: 'Stale approval' }
];

const columnForEntry = function (entry: Spec): BoardColumn {
    if (entry.type === 'idea') {
        return 'idea';
    }
    const state = approvalState(entry);
    if (state === 'current') {
        return 'approved';
    }
    return state === 'stale' ? 'stale' : 'draft';
};

// One card on the board: enough to render (title, type, labels) and to address the entry in the editor (file +
// index within that file's parsed entries, the same coordinates search results use).
type BoardCard = { file: string; entryIndex: number; title: string; type: Spec['type']; labels: string[] };

// Group every file's entries into columns, keeping file order within each column (the board is a view, so it
// imposes no ordering of its own).
const buildBoard = function (files: { name: string; entries: Spec[] }[]): Record<BoardColumn, BoardCard[]> {
    const board: Record<BoardColumn, BoardCard[]> = { idea: [], draft: [], approved: [], stale: [] };
    for (const file of files) {
        for (const [entryIndex, entry] of file.entries.entries()) {
            board[columnForEntry(entry)].push({
                file: file.name,
                entryIndex,
                title: entry.title,
                type: entry.type,
                labels: entry.labels
            });
        }
    }
    return board;
};

// The entry mutation a drag between two columns means, or null for a move the board cannot honestly perform: the
// only column-changing acts an entry supports are approving (draft/stale -> approved; a stale drag re-signs against
// the current content, exactly like the editor's Reapprove) and removing an approval (approved/stale -> draft).
// Nothing moves into or out of Ideas - that would be a type change, which belongs to the editor's Type dropdown,
// not to a drag whose meaning would be ambiguous.
const transitionForMove = function (from: BoardColumn, to: BoardColumn): 'approve' | 'unapprove' | null {
    if ((from === 'draft' || from === 'stale') && to === 'approved') {
        return 'approve';
    }
    if ((from === 'approved' || from === 'stale') && to === 'draft') {
        return 'unapprove';
    }
    return null;
};

export { BOARD_COLUMNS, type BoardCard, type BoardColumn, buildBoard, columnForEntry, transitionForMove };
