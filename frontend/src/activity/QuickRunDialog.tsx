import { type FormEvent, useState } from 'react';

import { PromptTemplatePicker } from '../settings/PromptTemplatePicker.tsx';
import { ResponsiveDialog } from '../shared/ResponsiveDialog.tsx';

import styles from './QuickRunDialog.module.css';

// The Quick run form: one free-prompt textarea (with the saved-template picker every instruction box offers) that
// queues a one-off agent job - the escape hatch for changes too small to deserve a spec. Owns its own state; the
// monitor mounts it only while open, so it always starts fresh. Submitting queues and closes immediately - progress
// lives in the job's row and transcript like every other run.
const QuickRunDialog = function ({ onClose, onRun }: { onClose: () => void; onRun: (prompt: string) => void }) {
    const [prompt, setPrompt] = useState('');

    const handleSubmit = function (event: FormEvent) {
        event.preventDefault();
        const trimmed = prompt.trim();
        if (trimmed === '') {
            return;
        }
        onRun(trimmed);
    };

    return (
        <ResponsiveDialog
            open
            onClose={onClose}
            title="Quick run"
            closable
            draggable
            noPrimaryButton
        >
            <form className={styles.quickForm} onSubmit={handleSubmit}>
                <p className={styles.quickHint}>
                    The text below goes to the agent verbatim - no template around it - and runs against this folder
                    with the same powers as every other agent action.
                </p>
                <PromptTemplatePicker onPick={setPrompt} />
                <textarea
                    className={styles.quickPrompt}
                    rows={5}
                    placeholder="e.g. bump the copyright year in the README and the license header"
                    aria-label="Quick run prompt"
                    value={prompt}
                    onChange={function (changeEvent) {
                        setPrompt(changeEvent.target.value);
                    }}
                />
                <div className={styles.quickActions}>
                    <button type="button" onClick={onClose}>Cancel</button>
                    <button type="submit" className={styles.quickSubmit} disabled={prompt.trim() === ''}>
                        Queue the run
                    </button>
                </div>
            </form>
        </ResponsiveDialog>
    );
};

export { QuickRunDialog };
