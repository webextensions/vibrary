import cx from 'classnames';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import type { MultiValue } from 'react-select';
import Select from 'react-select';

import { applyTruths } from '../api.ts';
import { confirmDialog } from '../confirmDialog.ts';
import { approvalState, type ApprovalState, emptyTruth, ENTRY_TYPE_BY_FAMILY, type EntryType, hashContent, nowTimestamp, type Truth } from '../runbooksXml.ts';
import { useScrollVisibility } from '../useScrollVisibility.ts';

import { AiIcon, PlusIcon } from './Icons.tsx';
import { ResponsiveDialog } from './ResponsiveDialog.tsx';
import { TruthCard } from './TruthCard.tsx';

import styles from './TruthsEditor.module.css';

type Option = { value: string; label: string };

type TruthsEditorProperties = {
    // Seeds the "Create with AI" dialog's type dropdown, derived from the open file's name (only a default, not a
    // constraint - a file may hold any mix of entry types).
    defaultEntryType: EntryType;
    truths: Truth[];
    allTitles: string[];
    onChange: (next: Truth[]) => void;
    // Generates the requested number of entries of the given type via the backend AI agent and refreshes the file.
    // Rejects on failure so the dialog can surface the error.
    onGenerate: (type: EntryType, count: number) => Promise<void>;
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

// Default and bounds for the "how many" input; the backend enforces the same upper bound.
const DEFAULT_GENERATE_COUNT = 3;
const MAX_GENERATE_COUNT = 50;

// Options for the "what to create" dropdown: the family label (plural) maps to the singular entry type written to file.
const CREATE_TYPE_OPTIONS: { value: EntryType; label: string }[] = Object.entries(ENTRY_TYPE_BY_FAMILY).map(function ([family, entryType]) {
    return { value: entryType, label: family };
});

const TruthsEditor = function ({ defaultEntryType, truths, allTitles, onChange, onGenerate, showFilters, statusFilter, onStatusFilterChange }: TruthsEditorProperties) {
    // Ids of truths currently open in edit mode. Existing truths default to review mode; only newly added truths (or
    // ones the user explicitly clicks "Edit" on) appear here.
    const [editingIds, setEditingIds] = useState<Set<string>>(function () {
        return new Set();
    });

    // Ids of truths ticked in the footer's selection checkboxes; drives the count and the batch "Apply changes" action.
    const [selectedIds, setSelectedIds] = useState<Set<string>>(function () {
        return new Set();
    });

    // The "Actions" popup above the footer: whether it is open, whether a batch apply is in flight, and the last error.
    const [actionsOpen, setActionsOpen] = useState(false);
    const [applying, setApplying] = useState(false);
    const [applyError, setApplyError] = useState<string | null>(null);
    const actionsReference = useRef<HTMLDivElement>(null);

    // The "Operations" popup above the footer: bulk approve / remove-approval / delete over the selected entries.
    const [operationsOpen, setOperationsOpen] = useState(false);
    const operationsReference = useRef<HTMLDivElement>(null);

    // The scrolling list element; the floating add button hides when scrolling down it and reappears when scrolling up.
    const scrollReference = useRef<HTMLDivElement>(null);
    const fabVisible = useScrollVisibility(scrollReference);

    // The "+" button expands into a speed-dial menu offering manual vs AI entry creation; the AI choice opens a dialog.
    const [menuOpen, setMenuOpen] = useState(false);
    const [aiDialogOpen, setAiDialogOpen] = useState(false);
    // The "Create entries with AI" form: what type and how many to request, whether a run is in flight, and the last
    // run's error.
    const [generateType, setGenerateType] = useState<EntryType>(defaultEntryType);
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

    // While the Actions popup is open, dismiss it on an outside click or Escape - but not while a batch apply is in
    // flight, since that run is editing files on disk and the popup shows its progress.
    useEffect(function () {
        if (!actionsOpen) {
            return undefined;
        }
        const handlePointerDown = function (event: MouseEvent) {
            if (!applying && !actionsReference.current?.contains(event.target as Node)) {
                setActionsOpen(false);
            }
        };
        const handleKeyDown = function (event: KeyboardEvent) {
            if (event.key === 'Escape' && !applying) {
                setActionsOpen(false);
            }
        };
        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return function () {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [actionsOpen, applying]);

    // While the Operations popup is open, dismiss it on an outside click or Escape.
    useEffect(function () {
        if (!operationsOpen) {
            return undefined;
        }
        const handlePointerDown = function (event: MouseEvent) {
            if (!operationsReference.current?.contains(event.target as Node)) {
                setOperationsOpen(false);
            }
        };
        const handleKeyDown = function (event: KeyboardEvent) {
            if (event.key === 'Escape') {
                setOperationsOpen(false);
            }
        };
        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return function () {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [operationsOpen]);

    const toggleSelect = function (id: string) {
        setSelectedIds(function (previous) {
            const next = new Set(previous);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

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
        const stamped = { ...next, updated: nowTimestamp(), updatedBy: 'Human' as const };
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
        setGenerateType(defaultEntryType);
        setGenerateCount(DEFAULT_GENERATE_COUNT);
        setGenerateError(null);
        setAiDialogOpen(true);
    };

    const handleGenerateSubmit = async function (event: FormEvent) {
        event.preventDefault();
        setGenerating(true);
        setGenerateError(null);
        try {
            await onGenerate(generateType, generateCount);
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

    // Selected truths in document order, ignoring any stale ids whose truth was removed. The footer count and the popup
    // summary both read from this.
    const selectedTruths = truths.filter(function (truth) {
        return selectedIds.has(truth.id);
    });

    // Run the backend's headless agent over every selected truth in one combined "claude -p" run, logging its stdout to
    // the browser console for debugging. On success the popup closes; on failure it stays open with the error.
    const handleApplyChanges = async function () {
        if (applying || selectedTruths.length === 0) {
            return;
        }
        setApplying(true);
        setApplyError(null);
        try {
            const output = await applyTruths(selectedTruths.map(function (truth) {
                return { title: truth.title, content: truth.content, notes: truth.notes };
            }));
            console.log(output);
            setActionsOpen(false);
        } catch (error) {
            console.error(error);
            setApplyError((error as Error).message);
        } finally {
            setApplying(false);
        }
    };

    // Whether every currently-shown entry is already ticked; gates the "Select all" link.
    const allShownSelected = shown.length > 0 && shown.every(function ({ truth }) {
        return selectedIds.has(truth.id);
    });

    // "Select all" ticks only the entries currently visible (a status filter may hide others), never the hidden ones.
    const selectAllShown = function () {
        setSelectedIds(new Set(shown.map(function ({ truth }) {
            return truth.id;
        })));
    };

    const deselectAll = function () {
        setSelectedIds(new Set());
    };

    // Apply a transform to every selected entry, stamping each as a fresh human edit - matching the single-card path
    // (TruthCard's onChange flows through updateAt, which stamps updated/updatedBy the same way).
    const updateSelected = function (transform: (truth: Truth) => Truth) {
        onChange(truths.map(function (truth) {
            if (!selectedIds.has(truth.id)) {
                return truth;
            }
            return { ...transform(truth), updated: nowTimestamp(), updatedBy: 'Human' as const };
        }));
    };

    const handleBulkApprove = function () {
        updateSelected(function (truth) {
            return { ...truth, approved: hashContent(truth) };
        });
        setOperationsOpen(false);
    };

    const handleBulkRemoveApproval = async function () {
        const confirmed = await confirmDialog(
            `Remove approval from ${selectedTruths.length} ${selectedTruths.length === 1 ? 'entry' : 'entries'}?`,
            'Remove approval'
        );
        if (!confirmed) {
            return;
        }
        updateSelected(function (truth) {
            return { ...truth, approved: '' };
        });
        setOperationsOpen(false);
    };

    const handleBulkDelete = async function () {
        const confirmed = await confirmDialog(
            `Remove ${selectedTruths.length} ${selectedTruths.length === 1 ? 'entry' : 'entries'}?`,
            'Remove'
        );
        if (!confirmed) {
            return;
        }
        onChange(truths.filter(function (truth) {
            return !selectedIds.has(truth.id);
        }));
        setSelectedIds(new Set());
        setOperationsOpen(false);
    };

    return (
        <div className={styles.truthsEditor}>
            <div className={styles.scrollArea} ref={scrollReference}>
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
                            selected={selectedIds.has(truth.id)}
                            onToggleSelect={function () {
                                toggleSelect(truth.id);
                            }}
                        />
                    );
                })}
            </div>

            {truths.length > 0 &&
            <div className={styles.footer}>
                <span className={styles.footerCount}>
                    {selectedTruths.length > 0 ?
                        `${selectedTruths.length}/${truths.length} entries selected` :
                        `${truths.length} entries`}
                </span>
                <button
                    type="button"
                    className={styles.selectLink}
                    disabled={allShownSelected}
                    onClick={selectAllShown}
                >
                    Select all
                </button>
                <button
                    type="button"
                    className={styles.selectLink}
                    disabled={selectedTruths.length === 0}
                    onClick={deselectAll}
                >
                    Deselect all
                </button>
                <div className={styles.actionsAnchor} ref={operationsReference}>
                    {operationsOpen &&
                    <div className={styles.actionsPopup}>
                        <p className={styles.actionsHeader}>{selectedTruths.length} entries selected</p>
                        <button type="button" className={styles.operationButton} onClick={handleBulkApprove}>Approve</button>
                        <button type="button" className={styles.operationButton} onClick={handleBulkRemoveApproval}>Remove Approval</button>
                        <button type="button" className={cx(styles.operationButton, styles.operationDanger)} onClick={handleBulkDelete}>Delete</button>
                    </div>}
                    <button
                        type="button"
                        className={styles.actionsButton}
                        disabled={selectedTruths.length === 0}
                        aria-expanded={operationsOpen}
                        onClick={function () {
                            setActionsOpen(false);
                            setOperationsOpen(function (previous) {
                                return !previous;
                            });
                        }}
                    >
                        Operations
                    </button>
                </div>
                <div className={styles.actionsAnchor} ref={actionsReference}>
                    {actionsOpen &&
                    <div className={styles.actionsPopup}>
                        <p className={styles.actionsHeader}>{selectedTruths.length} entries selected</p>
                        <ul className={styles.actionsTitleList}>
                            {selectedTruths.map(function (truth) {
                                return <li key={truth.id}>{truth.title || '(untitled)'}</li>;
                            })}
                        </ul>
                        {applyError !== null && <p className={styles.aiError}>{applyError}</p>}
                        <button
                            type="button"
                            className={styles.aiSubmit}
                            disabled={applying || selectedTruths.length === 0}
                            onClick={handleApplyChanges}
                        >
                            {applying ?
                                <span className={styles.aiSpinner} role="status" aria-label="Applying" /> :
                                'Apply changes'}
                        </button>
                    </div>}
                    <button
                        type="button"
                        className={styles.actionsButton}
                        disabled={selectedTruths.length === 0}
                        aria-expanded={actionsOpen}
                        onClick={function () {
                            setApplyError(null);
                            setOperationsOpen(false);
                            setActionsOpen(function (previous) {
                                return !previous;
                            });
                        }}
                    >
                        Actions
                    </button>
                </div>
            </div>}

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
                        <AiIcon /><span>Create entries with AI</span>
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
                title="Create entries with AI"
                closable={generating ? 'disabled' : true}
                draggable
                noPrimaryButton
            >
                <form className={styles.aiForm} onSubmit={handleGenerateSubmit}>
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
