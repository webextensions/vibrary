import { type FormEvent, useState } from 'react';

import { ResponsiveDialog } from '../shared/ResponsiveDialog.tsx';
import { ENTRY_TYPES, type EntryType } from '../xml/vibraryXml.ts';

import styles from './SpecsEditor.module.css';

type ChangeTypeDialogProperties = {
    onClose: () => void;
    // How many entries the change covers (the current selection), owned by SpecsEditor which holds the selection.
    selectedCount: number;
    // Set the entry type of every selected entry to `type`.
    onChangeType: (type: EntryType) => void
};

// Set the type of every selected entry at once - the bulk counterpart of a single card's Type row. A bulk Operation:
// SpecsEditor mounts this only while open, so its form state always starts fresh (defaulting to spec, the first type).
const ChangeTypeDialog = function ({ onClose, selectedCount, onChangeType }: ChangeTypeDialogProperties) {
    const [type, setType] = useState<EntryType>('spec');
    const entryWord = selectedCount === 1 ? 'entry' : 'entries';

    const handleSubmit = function (event: FormEvent) {
        event.preventDefault();
        onChangeType(type);
        onClose();
    };

    return (
        <ResponsiveDialog open onClose={onClose} title="Change type" draggable noPrimaryButton>
            <form className={styles.aiForm} onSubmit={handleSubmit}>
                <label className={styles.aiField} htmlFor="change-type-select">
                    Type:
                    <select
                        id="change-type-select"
                        value={type}
                        onChange={function (changeEvent) {
                            setType(changeEvent.target.value as EntryType);
                        }}
                    >
                        {ENTRY_TYPES.map(function (entryType) {
                            return <option key={entryType} value={entryType}>{entryType}</option>;
                        })}
                    </select>
                </label>
                <p className={styles.muted}>
                    Sets the type of the {selectedCount} selected {entryWord}.
                </p>
                <button type="submit" className={styles.aiSubmit}>
                    Change type
                </button>
            </form>
        </ResponsiveDialog>
    );
};

export { ChangeTypeDialog };
