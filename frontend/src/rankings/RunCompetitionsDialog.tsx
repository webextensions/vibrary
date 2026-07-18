import { type FormEvent, useState } from 'react';

import { MAX_COMPETITION_COUNT } from '../../../shared/apiLimits.js';
import { ResponsiveDialog } from '../shared/ResponsiveDialog.tsx';

import styles from './RankingsPanel.module.css';

// Enough matchups to meaningfully separate a small backlog without holding the agent slot for long; the upper bound
// is the shared MAX_COMPETITION_COUNT the backend route enforces.
const DEFAULT_COMPETITION_COUNT = 5;

// The "Run AI competitions" dialog: how many pairings to judge and optional one-time guidance for the judge (the
// same custom-instructions idea every other agent action offers). Owns its own form state; the panel mounts it only
// while open, so state always starts fresh. Submitting enqueues the job and closes immediately - progress lives in
// the Activity monitor, exactly like the editor's own agent actions.
const RunCompetitionsDialog = function ({ onClose, onRun }: {
    onClose: () => void;
    onRun: (count: number, instructions: string) => void
}) {
    const [count, setCount] = useState(DEFAULT_COMPETITION_COUNT);
    const [instructions, setInstructions] = useState('');

    const handleSubmit = function (event: FormEvent) {
        event.preventDefault();
        onRun(count, instructions.trim());
    };

    return (
        <ResponsiveDialog
            open
            onClose={onClose}
            title="Run AI competitions"
            closable
            draggable
            noPrimaryButton
        >
            <form className={styles.dialogForm} onSubmit={handleSubmit}>
                <p className={styles.hint}>
                    The AI judges head-to-head matchups (least-compared pairs first) and records each verdict with its
                    rationale. Every result can be reviewed and discarded in the match history.
                </p>
                <label className={styles.dialogField} htmlFor="competition-count">
                    How many matchups:
                    <input
                        id="competition-count"
                        type="number"
                        min={1}
                        max={MAX_COMPETITION_COUNT}
                        value={count}
                        onChange={function (changeEvent) {
                            const entered = Number(changeEvent.target.value) || 1;
                            setCount(Math.min(MAX_COMPETITION_COUNT, Math.max(1, entered)));
                        }}
                    />
                </label>
                <label className={styles.dialogField} htmlFor="competition-instructions">
                    Judging guidance (optional):
                    <textarea
                        id="competition-instructions"
                        rows={3}
                        placeholder="e.g. favor quick wins over long-term bets"
                        value={instructions}
                        onChange={function (changeEvent) {
                            setInstructions(changeEvent.target.value);
                        }}
                    />
                </label>
                <div className={styles.dialogActions}>
                    <button type="button" className={styles.compareButton} onClick={onClose}>Cancel</button>
                    <button type="submit" className={styles.primaryButton}>Queue the run</button>
                </div>
            </form>
        </ResponsiveDialog>
    );
};

export { RunCompetitionsDialog };
