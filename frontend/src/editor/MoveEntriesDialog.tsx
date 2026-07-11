import cx from 'classnames';
import { type FormEvent, useState } from 'react';
import CreatableSelect from 'react-select/creatable';

import { ResponsiveDialog } from '../shared/ResponsiveDialog.tsx';

import styles from './SpecsEditor.module.css';

type Option = { value: string; label: string };

type MoveEntriesDialogProperties = {
    onClose: () => void;
    // How many entries the move covers (the current selection), owned by SpecsEditor which holds the selection.
    selectedCount: number;
    // Vibrary files other than the open one, offered in the destination picker; the user may also type a new name.
    otherFiles: string[];
    // The open file has unsaved edits: the move reads the saved version on disk, so say to save first rather than
    // letting the user pick a destination and only then be refused.
    sourceDirty: boolean;
    // Perform the move into `targetName` (which may name a file that does not exist yet); resolves with an outcome so a
    // failure (an unsaved file, a bad name) shows in the dialog rather than closing it, and the user can fix and retry.
    onMove: (targetName: string) => Promise<{ ok: boolean; message?: string }>
};

// Move the selected entries into another vibrary file - a bulk Operation. The destination is a creatable select, so the
// user picks an existing file or types a new name to split the entries into a fresh file (the server creates it). The
// move runs on the server (source saved first), so the button spins while it is in flight and shows the reason on
// failure. SpecsEditor mounts this only while open, so its form state always starts fresh.
const MoveEntriesDialog = function ({ onClose, selectedCount, otherFiles, sourceDirty, onMove }: MoveEntriesDialogProperties) {
    const [target, setTarget] = useState<Option | null>(otherFiles[0] === undefined ? null : { value: otherFiles[0], label: otherFiles[0] });
    const [moving, setMoving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const entryWord = selectedCount === 1 ? 'entry' : 'entries';

    const handleSubmit = async function (event: FormEvent) {
        event.preventDefault();
        const targetName = target?.value ?? '';
        if (targetName === '' || moving) {
            return;
        }
        setMoving(true);
        setError(null);
        const outcome = await onMove(targetName);
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
                {sourceDirty ?
                    <p className={styles.muted}>Save this file first - the move relocates the saved version on disk. Save, then reopen this dialog.</p> :
                    (
                        <>
                            <label className={cx(styles.aiField, styles.aiFieldColumn)} htmlFor="move-target-select">
                                Destination:
                                <CreatableSelect<Option>
                                    inputId="move-target-select"
                                    classNamePrefix="rs"
                                    placeholder="Pick a file, or type a new name..."
                                    options={otherFiles.map(function (name) { return { value: name, label: name }; })}
                                    value={target}
                                    isDisabled={moving}
                                    onChange={function (option) { setTarget(option); }}
                                    formatCreateLabel={function (input) { return `Create "${input}"`; }}
                                />
                            </label>
                            <p className={styles.muted}>
                                Moves the {selectedCount} selected {entryWord} into the chosen file - an existing one, or
                                a new file you name here. The current file must be saved first.
                            </p>
                            {error !== null && <p className={styles.aiError}>{error}</p>}
                            <button type="submit" className={styles.aiSubmit} disabled={moving || target === null}>
                                {moving ? <span className={styles.aiSpinner} /> : 'Move'}
                            </button>
                        </>
                    )}
            </form>
        </ResponsiveDialog>
    );
};

export { MoveEntriesDialog };
