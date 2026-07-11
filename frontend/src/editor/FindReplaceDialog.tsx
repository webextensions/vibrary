import cx from 'classnames';
import { type FormEvent, useState } from 'react';

import { ResponsiveDialog } from '../shared/ResponsiveDialog.tsx';

import styles from './SpecsEditor.module.css';

type FindReplaceDialogProperties = {
    onClose: () => void;
    // How many entries the replace will cover (the current selection) and a live count of the term's occurrences among
    // them (honoring the Match case toggle), both owned by SpecsEditor which holds the specs and the selection.
    selectedCount: number;
    countFor: (find: string, isCaseSensitive: boolean) => number;
    // Replace every occurrence of `find` with `replace` in the selected entries' content and notes.
    onReplace: (find: string, replace: string, isCaseSensitive: boolean) => void
};

// Find & replace across the selected entries' content and notes (never titles - they are relatesTo identifiers). A
// bulk Operation: SpecsEditor mounts this only while open, so its form state always starts fresh. The live occurrence
// count updates as the Find term (and the Match case toggle) change, and Replace all is disabled until the term
// matches something.
const FindReplaceDialog = function ({ onClose, selectedCount, countFor, onReplace }: FindReplaceDialogProperties) {
    const [find, setFind] = useState('');
    const [replace, setReplace] = useState('');
    // Case-sensitive by default, so a bulk replace matches exactly what was typed rather than silently touching other
    // casings; unticking Match case broadens it.
    const [matchCase, setMatchCase] = useState(true);
    const occurrences = countFor(find, matchCase);
    const entryWord = selectedCount === 1 ? 'entry' : 'entries';

    const handleSubmit = function (event: FormEvent) {
        event.preventDefault();
        if (find === '' || occurrences === 0) {
            return;
        }
        onReplace(find, replace, matchCase);
        onClose();
    };

    return (
        <ResponsiveDialog open onClose={onClose} title="Find and replace" draggable noPrimaryButton>
            <form className={styles.aiForm} onSubmit={handleSubmit}>
                <label className={cx(styles.aiField, styles.aiFieldColumn)} htmlFor="find-text">
                    Find:
                    <input
                        id="find-text"
                        type="text"
                        value={find}
                        onChange={function (changeEvent) {
                            setFind(changeEvent.target.value);
                        }}
                    />
                </label>
                <label className={cx(styles.aiField, styles.aiFieldColumn)} htmlFor="replace-text">
                    Replace with:
                    <input
                        id="replace-text"
                        type="text"
                        value={replace}
                        onChange={function (changeEvent) {
                            setReplace(changeEvent.target.value);
                        }}
                    />
                </label>
                <label className={styles.aiField} htmlFor="find-match-case">
                    <input
                        id="find-match-case"
                        type="checkbox"
                        checked={matchCase}
                        onChange={function (changeEvent) {
                            setMatchCase(changeEvent.target.checked);
                        }}
                    />
                    Match case
                </label>
                <p className={styles.muted}>
                    {find === '' ?
                        `Replaces in the content and notes of the ${selectedCount} selected ${entryWord}; titles are left alone.` :
                        `${occurrences} ${occurrences === 1 ? 'occurrence' : 'occurrences'} in the ${selectedCount} selected ${entryWord}.`}
                </p>
                <button type="submit" className={styles.aiSubmit} disabled={find === '' || occurrences === 0}>
                    Replace all
                </button>
            </form>
        </ResponsiveDialog>
    );
};

export { FindReplaceDialog };
