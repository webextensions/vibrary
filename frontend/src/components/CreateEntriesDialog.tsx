import cx from 'classnames';
import { type FormEvent, useState } from 'react';

import { ENTRY_TYPE_BY_FAMILY, type EntryType } from '../vibraryXml.ts';

import { ResponsiveDialog } from './ResponsiveDialog.tsx';

import styles from './SpecsEditor.module.css';

// Default and bounds for the "how many" input; the backend enforces the same upper bound.
const DEFAULT_GENERATE_COUNT = 3;
const MAX_GENERATE_COUNT = 50;

// Options for the "what to create" dropdown: the family label (plural) maps to the singular entry type written to file.
const CREATE_TYPE_OPTIONS: { value: EntryType; label: string }[] = Object.entries(ENTRY_TYPE_BY_FAMILY).map(function ([family, entryType]) {
    return { value: entryType, label: family };
});

type CreateEntriesDialogProperties = {
    onClose: () => void;
    // Seeds the type dropdown, derived from the open file's name (only a default, not a constraint - the generated
    // entries can be of any type the user picks).
    defaultEntryType: EntryType;
    // Generates the requested number of entries of the given type via the backend AI agent and refreshes the file.
    // `instructions` carries optional custom one-time guidance from this dialog's own field. Rejects on failure so the
    // dialog can surface the error.
    onGenerate: (type: EntryType, count: number, instructions: string) => Promise<void>
};

// The floating "+" button's "Create entries with AI" dialog: pick a type and a count, then run the backend's headless
// agent to append that many entries to the open file. Owns its own form state (SpecsEditor only owns whether it is
// open, by mounting this component only while it is - so state always starts fresh, with no reset-on-open effect
// needed).
const CreateEntriesDialog = function ({ onClose, defaultEntryType, onGenerate }: CreateEntriesDialogProperties) {
    const [generateType, setGenerateType] = useState<EntryType>(defaultEntryType);
    const [generateCount, setGenerateCount] = useState(DEFAULT_GENERATE_COUNT);
    const [instructions, setInstructions] = useState('');
    const [generating, setGenerating] = useState(false);
    const [generateError, setGenerateError] = useState<string | null>(null);

    const handleSubmit = async function (event: FormEvent) {
        event.preventDefault();
        setGenerating(true);
        setGenerateError(null);
        try {
            await onGenerate(generateType, generateCount, instructions.trim());
            onClose();
        } catch (error) {
            setGenerateError((error as Error).message);
        } finally {
            setGenerating(false);
        }
    };

    return (
        <ResponsiveDialog
            open
            onClose={onClose}
            title="Create entries with AI"
            // A run edits files on disk, so block dismissal (button, Escape, backdrop) until it finishes rather than
            // leaving it orphaned; ResponsiveDialog gates every dismissal path on this prop.
            closable={generating ? 'disabled' : true}
            draggable
            noPrimaryButton
        >
            <form className={styles.aiForm} onSubmit={handleSubmit}>
                <label className={styles.aiField} htmlFor="ai-entry-type">
                    What to create:
                    <select
                        id="ai-entry-type"
                        value={generateType}
                        disabled={generating}
                        onChange={function (changeEvent) {
                            setGenerateType(changeEvent.target.value as EntryType);
                        }}
                    >
                        {CREATE_TYPE_OPTIONS.map(function (option) {
                            return <option key={option.value} value={option.value}>{option.label}</option>;
                        })}
                    </select>
                </label>
                <label className={styles.aiField} htmlFor="ai-entry-count">
                    How many:
                    <input
                        id="ai-entry-count"
                        type="number"
                        min={1}
                        max={MAX_GENERATE_COUNT}
                        value={generateCount}
                        disabled={generating}
                        onChange={function (changeEvent) {
                            setGenerateCount(changeEvent.target.valueAsNumber);
                        }}
                    />
                </label>
                <label className={cx(styles.aiField, styles.aiFieldColumn)} htmlFor="ai-instructions">
                    Custom instructions (optional):
                    <textarea
                        id="ai-instructions"
                        rows={3}
                        placeholder="e.g. focus on the backend only, use a specific format"
                        value={instructions}
                        disabled={generating}
                        onChange={function (changeEvent) {
                            setInstructions(changeEvent.target.value);
                        }}
                    />
                </label>
                {generateError !== null && <p className={styles.aiError}>{generateError}</p>}
                <button
                    type="submit"
                    className={styles.aiSubmit}
                    disabled={generating || !Number.isSafeInteger(generateCount) || generateCount < 1 || generateCount > MAX_GENERATE_COUNT}
                >
                    {generating ?
                        <span className={styles.aiSpinner} role="status" aria-label="Generating" /> :
                        'Create'}
                </button>
            </form>
        </ResponsiveDialog>
    );
};

export { CreateEntriesDialog };
