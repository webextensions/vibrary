import { type GitStash } from '../api.ts';
import { AccordionSection } from './AccordionSection.tsx';
import { PlusIcon } from './Icons.tsx';

import styles from './SourceControlPanel.module.css';

type StashSectionProperties = {
    stashes: GitStash[];
    expanded: boolean;
    onToggle: () => void;
    // Disables every stash action (shared with the rest of the Source Control panel, so two mutations never overlap).
    busy: boolean;
    // Whether a stash-save is in flight, driving the header button's spinner.
    stashing: boolean;
    // How many changed files are currently shown in Status, so "Stash all" can disable itself with nothing to stash.
    totalChanged: number;
    onStashSave: () => void;
    onStashApply: (stash: GitStash) => void;
    onStashPop: (stash: GitStash) => void;
    onStashDrop: (stash: GitStash) => void
};

// The Source Control panel's "Stashes" accordion: the stash list (apply / pop / drop each by its stash@{N} index) plus
// a header button to stash everything currently shown in Status. Purely presentational - all state and the actual git
// calls live in SourceControlPanel, which is the single owner of `status`/`stashes` (both stash and status mutations
// refresh each other, so keeping one owner avoids the two views drifting out of sync).
const StashSection = function (
    { stashes, expanded, onToggle, busy, stashing, totalChanged, onStashSave, onStashApply, onStashPop, onStashDrop }:
    StashSectionProperties
) {
    return (
        <AccordionSection
            title="Stashes"
            expanded={expanded}
            onToggle={onToggle}
            badge={stashes.length > 0 ? <span className={styles.statusCount}>{stashes.length}</span> : undefined}
            actions={
                <button
                    type="button"
                    className={styles.iconButton}
                    aria-label="Stash all current changes"
                    title={totalChanged === 0 ? 'No changes to stash' : 'Stash all current changes'}
                    onClick={onStashSave}
                    disabled={busy || totalChanged === 0}
                >
                    {stashing ? <span className={styles.spinner} role="status" aria-label="Stashing" /> : <PlusIcon />}
                </button>
            }
        >
            {stashes.length === 0 && <p className={styles.message}>No stashes.</p>}
            {stashes.length > 0 &&
            <ul className={styles.fileList}>
                {stashes.map(function (stash) {
                    return (
                        <li key={stash.index} className={styles.stashRow}>
                            <span className={styles.stashIndex}>{stash.index}</span>
                            <span className={styles.stashMessage} title={`stash@{${stash.index}} - ${stash.message} (${new Date(stash.date).toLocaleString()})`}>
                                {stash.message}
                            </span>
                            <span className={styles.stashActions}>
                                <button
                                    type="button"
                                    className={styles.stashAction}
                                    title="Apply this stash, keeping it in the list"
                                    disabled={busy}
                                    onClick={function () {
                                        onStashApply(stash);
                                    }}
                                >
                                    Apply
                                </button>
                                <button
                                    type="button"
                                    className={styles.stashAction}
                                    title="Apply this stash and remove it from the list"
                                    disabled={busy}
                                    onClick={function () {
                                        onStashPop(stash);
                                    }}
                                >
                                    Pop
                                </button>
                                <button
                                    type="button"
                                    className={styles.stashAction}
                                    title="Delete this stash"
                                    disabled={busy}
                                    onClick={function () {
                                        onStashDrop(stash);
                                    }}
                                >
                                    Drop
                                </button>
                            </span>
                        </li>
                    );
                })}
            </ul>}
        </AccordionSection>
    );
};

export { StashSection };
