import { type FormEvent, useState } from 'react';

import { ResponsiveDialog } from '../shared/ResponsiveDialog.tsx';

import styles from './SpecsEditor.module.css';

type MoveEntriesDialogProperties = {
    onClose: () => void;
    // How many entries the move covers (the current selection), owned by SpecsEditor which holds the selection.
    selectedCount: number;
    // Vibrary files other than the open one, for the destination picker.
    otherFiles: string[];
    // The open file has unsaved edits: the move reads the saved version on disk, so say to save first rather than
    // letting the user pick a destination and only then be refused.
    sourceDirty: boolean;
    // Perform the move into `targetName`; resolves with an outcome so a failure (e.g. an unsaved file) shows in the
    // dialog rather than closing it. The dialog stays open on failure so the user can fix the cause and retry.
    onMove: (targetName: string) => Promise<{ ok: boolean; message?: string }>
};

// Move the selected entries into another vibrary file - a bulk Operation. SpecsEditor mounts this only while open, so
// its form state always starts fresh (the first destination preselected). The move runs on the server (source saved
// first), so the button shows a spinner while it is in flight and surfaces the server's reason on failure.
const MoveEntriesDialog = function ({ onClose, selectedCount, otherFiles, sourceDirty, onMove }: MoveEntriesDialogProperties) {
    const [target, setTarget] = useState(otherFiles[0] ?? '');
    const [moving, setMoving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const entryWord = selectedCount === 1 ? 'entry' : 'entries';

    // Why the picker cannot be shown, if anything: the move reads the saved file, so an unsaved one blocks it up front;
    // and there must be somewhere to move into. Null means the picker is usable.
    let blockingMessage: string | null = null;
    if (sourceDirty) {
        blockingMessage = 'Save this file first - the move relocates the saved version on disk. Save, then reopen this dialog.';
    } else if (otherFiles.length === 0) {
        blockingMessage = 'There is no other vibrary file to move into - create one first.';
    }

    const handleSubmit = async function (event: FormEvent) {
        event.preventDefault();
        if (target === '' || moving) {
            return;
        }
        setMoving(true);
        setError(null);
        const outcome = await onMove(target);
        if (outcome.ok) {
            onClose();
            return;
        }
        setError(outcome.message ?? 'Unable to move entries.');
        setMoving(false);
    };

    return (
        <ResponsiveDialog open onClose={onClose} title="Move to file" draggable noPrimaryButton>
            <form className={styles.aiForm} onSubmit={handleSubmit}>
                {blockingMessage !== null ?
                    <p className={styles.muted}>{blockingMessage}</p> :
                    (
                        <>
                            <label className={styles.aiField} htmlFor="move-target-select">
                                Destination:
                                <select
                                    id="move-target-select"
                                    value={target}
                                    disabled={moving}
                                    onChange={function (changeEvent) { setTarget(changeEvent.target.value); }}
                                >
                                    {otherFiles.map(function (name) {
                                        return <option key={name} value={name}>{name}</option>;
                                    })}
                                </select>
                            </label>
                            <p className={styles.muted}>
                                Moves the {selectedCount} selected {entryWord} into the chosen file. The current file
                                must be saved first.
                            </p>
                            {error !== null && <p className={styles.aiError}>{error}</p>}
                            <button type="submit" className={styles.aiSubmit} disabled={moving}>
                                {moving ? <span className={styles.aiSpinner} /> : 'Move'}
                            </button>
                        </>
                    )}
            </form>
        </ResponsiveDialog>
    );
};

export { MoveEntriesDialog };
