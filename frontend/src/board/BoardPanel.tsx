import { type DragEvent, useEffect, useState } from 'react';
import { toast } from 'react-toastify';

import { getFile, listFiles, saveFile } from '../api.ts';
import { announce } from '../shared/announcer.ts';
import { confirmDialog } from '../shared/confirmDialog.ts';
import { RefreshIcon, TypeIcon } from '../shared/Icons.tsx';
import { hashContent, nowTimestamp, parseVibraryXml, serializeVibraryXml, type Spec } from '../xml/vibraryXml.ts';
import { BOARD_COLUMNS, type BoardCard, type BoardColumn, buildBoard, transitionForMove } from './boardModel.ts';

import styles from './BoardPanel.module.css';

// One parsed file with the version token its save must echo (the editor's own conflict detection), so a board
// transition can never silently clobber an edit that landed between our read and our write.
type LoadedFile = { name: string; fileHash: string; entries: Spec[] };

const loadBoardFiles = async function (): Promise<LoadedFile[]> {
    const { files } = await listFiles();
    const loaded: LoadedFile[] = [];
    for (const name of files) {
        try {
            const { content, fileHash } = await getFile(name);
            loaded.push({ name, fileHash, entries: parseVibraryXml(content) });
        } catch {
            // An unreadable/unparseable file simply contributes no cards, exactly as the explorer skips its badges.
            continue;
        }
    }
    return loaded;
};

// The payload a dragged card carries to its drop target.
type DragPayload = { file: string; entryIndex: number; from: BoardColumn };

// The Board view: the folder's entries as workflow columns (see boardModel.ts). Dragging a card performs the legal
// transition (approve / unapprove - the latter confirmed) by writing the file through the same save path and
// conflict detection the editor uses; a drag with no legal meaning snaps back with a toast explaining why. The
// board reads the SAVED files, so an open tab's unsaved edits are not reflected until saved - it is a folder view,
// not an editor view.
const BoardPanel = function ({ onOpenEntry }: { onOpenEntry: (name: string, title: string, entryIndex: number) => void }) {
    const [files, setFiles] = useState<LoadedFile[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [dragOverColumn, setDragOverColumn] = useState<BoardColumn | null>(null);
    // Bumped to re-run the load effect (mount load + Refresh + after every transition).
    const [reloadNonce, setReloadNonce] = useState(0);

    useEffect(function () {
        let isActive = true;
        const load = async function () {
            try {
                const loaded = await loadBoardFiles();
                if (isActive) {
                    setFiles(loaded);
                    setError(null);
                }
            } catch (loadError) {
                if (isActive) {
                    setError(loadError instanceof Error ? loadError.message : 'Failed to load the board');
                }
            }
        };
        void load();
        return function () {
            isActive = false;
        };
    }, [reloadNonce]);

    const board = files === null ?
        null :
        buildBoard(files.map(function (file) {
            return { name: file.name, entries: file.entries };
        }));

    // Apply a legal transition: recompute the entry's approval against its CURRENT content (approve re-signs, the
    // Reapprove semantics; unapprove clears), stamp the edit, and save with the load's version token so a
    // concurrent change on disk turns into a clean conflict error instead of a lost edit.
    const applyTransition = async function (payload: DragPayload, transition: 'approve' | 'unapprove') {
        const file = files?.find(function (candidate) { return candidate.name === payload.file; });
        const entry = file?.entries[payload.entryIndex];
        if (file === undefined || entry === undefined) {
            return;
        }
        if (transition === 'unapprove' && !(await confirmDialog(`Remove the approval from "${entry.title || 'this entry'}"?`, 'Remove approval'))) {
            return;
        }
        setBusy(true);
        try {
            const changed = file.entries.map(function (candidate, index) {
                if (index !== payload.entryIndex) {
                    return candidate;
                }
                return {
                    ...candidate,
                    approved: transition === 'approve' ? hashContent(candidate.content) : '',
                    updated: nowTimestamp(),
                    updatedBy: 'Human' as const
                };
            });
            await saveFile(file.name, serializeVibraryXml(changed), file.fileHash);
            announce(transition === 'approve' ? `Approved ${entry.title}` : `Removed the approval from ${entry.title}`);
        } catch (saveError) {
            toast.error(saveError instanceof Error ? saveError.message : 'The board could not save the change');
        } finally {
            setBusy(false);
            setReloadNonce(function (previous) { return previous + 1; });
        }
    };

    const handleDrop = function (to: BoardColumn, event: DragEvent) {
        event.preventDefault();
        setDragOverColumn(null);
        if (busy) {
            return;
        }
        let payload: DragPayload;
        try {
            payload = JSON.parse(event.dataTransfer.getData('application/json')) as DragPayload;
        } catch {
            return;
        }
        const transition = transitionForMove(payload.from, to);
        if (transition === null) {
            if (payload.from !== to) {
                toast.info('Only approve (into Approved) and remove-approval (into Draft) moves are possible; the type is changed in the editor.');
            }
            return;
        }
        void applyTransition(payload, transition);
    };

    return (
        <div className={styles.boardPanel}>
            <div className={styles.headerRow}>
                <h2 className={styles.heading}>Board</h2>
                <button
                    type="button"
                    className={styles.iconButton}
                    aria-label="Refresh the board"
                    title="Refresh the board"
                    onClick={function () {
                        setReloadNonce(function (previous) { return previous + 1; });
                    }}
                >
                    <RefreshIcon />
                </button>
            </div>

            {error !== null && <p className={styles.errorText} role="alert">{error}</p>}

            {board !== null && BOARD_COLUMNS.every(function (column) { return board[column.key].length === 0; }) &&
            <p className={styles.emptyState}>No entries yet - the board fills as the folder's files gain entries.</p>}

            {board !== null && BOARD_COLUMNS.map(function (column) {
                const cards = board[column.key];
                return (
                    <section
                        key={column.key}
                        className={styles.column}
                        onDragOver={function (event) {
                            event.preventDefault();
                            setDragOverColumn(column.key);
                        }}
                        onDragLeave={function () {
                            setDragOverColumn(function (previous) { return previous === column.key ? null : previous; });
                        }}
                        onDrop={function (event) {
                            handleDrop(column.key, event);
                        }}
                    >
                        <h3 className={styles.columnHeading}>
                            {column.label}
                            <span className={styles.columnCount}>{cards.length}</span>
                        </h3>
                        <ul className={dragOverColumn === column.key ? styles.cardListActive : styles.cardList}>
                            {cards.map(function (card: BoardCard) {
                                return (
                                    <li key={`${card.file}#${card.entryIndex}`}>
                                        <button
                                            type="button"
                                            className={styles.card}
                                            // Ideas only move via the editor's Type dropdown, so their cards do not
                                            // even offer the drag.
                                            draggable={column.key !== 'idea' && !busy}
                                            title={`${card.title || '(untitled)'} (${card.file}) - click to open${column.key === 'idea' ? '' : ', drag to approve or remove approval'}`}
                                            onDragStart={function (event) {
                                                event.dataTransfer.setData('application/json', JSON.stringify({ file: card.file, entryIndex: card.entryIndex, from: column.key } satisfies DragPayload));
                                                event.dataTransfer.effectAllowed = 'move';
                                            }}
                                            onClick={function () {
                                                onOpenEntry(card.file, card.title, card.entryIndex);
                                            }}
                                        >
                                            <span className={styles.cardType}><TypeIcon type={card.type} /></span>
                                            <span className={styles.cardTitle}>{card.title || '(untitled)'}</span>
                                            <span className={styles.cardFile}>{card.file}</span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                );
            })}
        </div>
    );
};

export { BoardPanel };
