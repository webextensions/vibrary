import cx from 'classnames';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import type { MultiValue } from 'react-select';
import Select from 'react-select';

import { approvalState, type ApprovalState, emptyTruth, nowTimestamp, type Truth } from '../truthsXml.ts';
import { useScrollVisibility } from '../useScrollVisibility.ts';

import { AiIcon, PlusIcon } from './Icons.tsx';
import { ResponsiveDialog } from './ResponsiveDialog.tsx';
import { TruthCard } from './TruthCard.tsx';

import styles from './TruthsEditor.module.css';

type Option = { value: string; label: string };

type TruthsEditorProperties = {
    truths: Truth[];
    allTitles: string[];
    onChange: (next: Truth[]) => void;
    // Generates the requested number of truths via the backend AI agent and refreshes the file. Rejects on failure so
    // the dialog can surface the error.
    onGenerate: (count: number) => Promise<void>;
    // Whether the status-filter dropdown is open. Toggled by the Filter button in the toolbar (see App.tsx).
    showFilters: boolean;
    // Selected status filters, owned by App so the toolbar's Filter button can show an "active" badge.
    statusFilter: Option[];
    onStatusFilterChange: (next: Option[]) => void
};

// Human-readable label per approval state, shown as the filter option text.
const STATE_LABELS: Record<ApprovalState, string> = {
    current: 'Approved',
    stale: 'Needs re-approval',
    none: 'Not approved'
};

// Order the states most-approved-first.
const STATE_ORDER: ApprovalState[] = ['current', 'stale', 'none'];

// One filter option per approval state. The option value is the state itself, so a selection maps straight back to a
// state when matching.
const FILTER_OPTIONS: Option[] = STATE_ORDER.map(function (state) {
    return { value: state, label: STATE_LABELS[state] };
});

// Default and bounds for the "how many truths" input; the backend enforces the same upper bound.
const DEFAULT_GENERATE_COUNT = 3;
const MAX_GENERATE_COUNT = 50;

const TruthsEditor = function ({ truths, allTitles, onChange, onGenerate, showFilters, statusFilter, onStatusFilterChange }: TruthsEditorProperties) {
    // Ids of truths currently open in edit mode. Existing truths default to review mode; only newly added truths (or
    // ones the user explicitly clicks "Edit" on) appear here.
    const [editingIds, setEditingIds] = useState<Set<string>>(function () {
        return new Set();
    });

    // The scrolling list element; the floating add button hides when scrolling down it and reappears when scrolling up.
    const scrollReference = useRef<HTMLDivElement>(null);
    const fabVisible = useScrollVisibility(scrollReference);

    // The "+" button expands into a speed-dial menu offering manual vs AI truth creation; the AI choice opens a dialog.
    const [menuOpen, setMenuOpen] = useState(false);
    const [aiDialogOpen, setAiDialogOpen] = useState(false);
    // The "Create with AI" form: how many truths to request, whether a run is in flight, and the last run's error.
    const [generateCount, setGenerateCount] = useState(DEFAULT_GENERATE_COUNT);
    const [generating, setGenerating] = useState(false);
    const [generateError, setGenerateError] = useState<string | null>(null);
    const speedDialReference = useRef<HTMLDivElement>(null);

    // While the speed-dial menu is open, collapse it on an outside click or Escape so it behaves like a popup.
    useEffect(function () {
        if (!menuOpen) {
            return undefined;
        }
        const handlePointerDown = function (event: MouseEvent) {
            if (!speedDialReference.current?.contains(event.target as Node)) {
                setMenuOpen(false);
            }
        };
        const handleKeyDown = function (event: KeyboardEvent) {
            if (event.key === 'Escape') {
                setMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return function () {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [menuOpen]);

    const toggleMode = function (id: string) {
        setEditingIds(function (previous) {
            const next = new Set(previous);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const updateAt = function (index: number, next: Truth) {
        // Any edit to an existing truth flows through here, so stamp the update time and updater in one place. The
        // editor UI is only ever driven by a human, so the updater is Human; AI stamps itself when editing the file.
        const stamped = { ...next, lastUpdated: nowTimestamp(), updatedBy: 'Human' as const };
        onChange(truths.map(function (truth, position) {
            return position === index ? stamped : truth;
        }));
    };

    const removeAt = function (index: number) {
        onChange(truths.filter(function (_truth, position) {
            return position !== index;
        }));
    };

    const addTruth = function () {
        const truth = emptyTruth();
        onChange([...truths, truth]);
        setEditingIds(function (previous) {
            return new Set(previous).add(truth.id); // a brand-new truth opens directly in edit mode
        });
        // After React commits the new card, bring the whole card into view and focus its content box so the user can
        // start typing right away. preventScroll keeps focus from fighting the smooth scrollIntoView positioning.
        requestAnimationFrame(function () {
            const textarea = document.getElementById(`truth-${truth.id}-content`);
            if (textarea instanceof HTMLTextAreaElement) {
                textarea.closest('fieldset')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                textarea.focus({ preventScroll: true });
            }
        });
    };

    const openAiDialog = function () {
        setGenerateCount(DEFAULT_GENERATE_COUNT);
        setGenerateError(null);
        setAiDialogOpen(true);
    };

    const handleGenerateSubmit = async function (event: FormEvent) {
        event.preventDefault();
        setGenerating(true);
        setGenerateError(null);
        try {
            await onGenerate(generateCount);
            setAiDialogOpen(false);
        } catch (error) {
            setGenerateError((error as Error).message);
        } finally {
            setGenerating(false);
        }
    };

    // A truth matches if its approval state is among the selected statuses. No selection means everything matches.
    const selectedKeys = new Set(statusFilter.map(function (option) {
        return option.value;
    }));
    const isFilterMatch = function (truth: Truth): boolean {
        if (selectedKeys.size === 0) {
            return true;
        }
        return selectedKeys.has(approvalState(truth));
    };

    // Keep each truth's original index so updateAt/removeAt still address the full list after filtering. A truth being
    // edited is always shown - otherwise a freshly added truth (none/none) or one whose status just changed would
    // vanish mid-edit.
    const shown = truths
        .map(function (truth, index) {
            return { truth, index };
        })
        .filter(function ({ truth }) {
            return editingIds.has(truth.id) || isFilterMatch(truth);
        });

    return (
        <div className={styles.truthsEditor} ref={scrollReference}>
            {truths.length > 0 && (showFilters || statusFilter.length > 0) &&
            <div className={styles.truthFilter}>
                {statusFilter.length > 0 &&
                <span className={cx(styles.filterCount, styles.muted)}>{shown.length} of {truths.length} shown</span>}
                {showFilters &&
                <Select<Option, true>
                    classNamePrefix="rs"
                    isMulti
                    placeholder="Filter by approval status..."
                    aria-label="Filter truths by approval status"
                    options={FILTER_OPTIONS}
                    value={statusFilter}
                    onChange={function (options: MultiValue<Option>) {
                        onStatusFilterChange([...options]);
                    }}
                />}
            </div>}

            {truths.length === 0 && <p className={styles.placeholder}>No truths yet. Add one to get started.</p>}

            {truths.length > 0 && shown.length === 0 &&
            <p className={styles.placeholder}>No truths match the selected statuses.</p>}

            {shown.map(function ({ truth, index }) {
                return (
                    <TruthCard
                        key={truth.id}
                        index={index}
                        mode={editingIds.has(truth.id) ? 'edit' : 'review'}
                        value={truth}
                        allTitles={allTitles}
                        onChange={function (next) {
                            updateAt(index, next);
                        }}
                        onToggleMode={function () {
                            toggleMode(truth.id);
                        }}
                        onRemove={function () {
                            removeAt(index);
                        }}
                    />
                );
            })}

            <div
                ref={speedDialReference}
                className={cx(styles.speedDial, { [styles.speedDialHidden]: !fabVisible && !menuOpen })}
            >
                {menuOpen &&
                <div className={styles.speedDialActions}>
                    <button
                        type="button"
                        className={styles.speedDialAction}
                        onClick={function () {
                            setMenuOpen(false);
                            openAiDialog();
                        }}
                    >
                        <AiIcon /><span>Create with AI</span>
                    </button>
                    <button
                        type="button"
                        className={styles.speedDialAction}
                        onClick={function () {
                            setMenuOpen(false);
                            addTruth();
                        }}
                    >
                        <PlusIcon /><span>Create manually</span>
                    </button>
                </div>}

                <button
                    type="button"
                    className={styles.fab}
                    aria-label={menuOpen ? 'Close menu' : 'Add truth'}
                    aria-expanded={menuOpen}
                    onClick={function () {
                        setMenuOpen(function (previous) {
                            return !previous;
                        });
                    }}
                >
                    <span className={cx(styles.fabIcon, { [styles.fabIconOpen]: menuOpen })}>
                        <PlusIcon />
                    </span>
                </button>
            </div>

            <ResponsiveDialog
                open={aiDialogOpen}
                onClose={function () {
                    // A run edits files on disk, so block dismissal until it finishes rather than leaving it orphaned.
                    if (!generating) {
                        setAiDialogOpen(false);
                    }
                }}
                title="Create truths with AI"
                closable={generating ? 'disabled' : true}
                draggable
                noPrimaryButton
            >
                <form className={styles.aiForm} onSubmit={handleGenerateSubmit}>
                    <label className={styles.aiField} htmlFor="ai-truth-count">
                        Create how many truths:
                        <input
                            id="ai-truth-count"
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
        </div>
    );
};

export { TruthsEditor };
export type { Option };
