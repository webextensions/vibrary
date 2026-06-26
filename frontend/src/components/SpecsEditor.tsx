import cx from 'classnames';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { MultiValue } from 'react-select';
import Select from 'react-select';

import { useActivityQueue } from '../activityQueue.ts';
import { applySpecs } from '../api.ts';
import { confirmDialog } from '../confirmDialog.ts';
import { type SchemaMap } from '../loadRunbooksFile.ts';
import { approvalState, type ApprovalState, emptySpec, ENTRY_TYPE_BY_FAMILY, ENTRY_TYPES, type EntryType, hashContent, nowTimestamp, type Spec } from '../runbooksXml.ts';

import { AiIcon, PlusIcon } from './Icons.tsx';
import { ResponsiveDialog } from './ResponsiveDialog.tsx';
import { SpecCard } from './SpecCard.tsx';

import styles from './SpecsEditor.module.css';

type Option = { value: string; label: string };

type SpecsEditorProperties = {
    // Seeds the "Create with AI" dialog's type dropdown, derived from the open file's name (only a default, not a
    // constraint - a file may hold any mix of entry types).
    defaultEntryType: EntryType;
    specs: Spec[];
    // Resolved option-form schemas for this file's entries, keyed by formSchemaRef; forwarded to each SpecCard.
    schemas: SchemaMap;
    allTitles: string[];
    // A Search query whose first matching entry the editor scrolls to and briefly highlights. Set when this file was
    // opened from a Search result; undefined otherwise.
    highlightQuery?: string;
    onChange: (next: Spec[]) => void;
    // Generates the requested number of entries of the given type via the backend AI agent and refreshes the file.
    // Rejects on failure so the dialog can surface the error.
    onGenerate: (type: EntryType, count: number) => Promise<void>;
    // Whether the filter dropdowns are open. Toggled by the Filter button in the toolbar (see App.tsx).
    showFilters: boolean;
    // Selected status filters, owned by App so the toolbar's Filter button can show an "active" badge.
    statusFilter: Option[];
    onStatusFilterChange: (next: Option[]) => void;
    // Selected entry-type filters, owned by App alongside statusFilter.
    typeFilter: Option[];
    onTypeFilterChange: (next: Option[]) => void
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

// Human-readable label per entry type, shown as the type-filter option text.
const TYPE_LABELS: Record<EntryType, string> = {
    spec: 'Spec',
    review: 'Review',
    task: 'Task',
    idea: 'Idea'
};

// One filter option per entry type. The option value is the type itself, so a selection maps straight back to a type
// when matching.
const TYPE_FILTER_OPTIONS: Option[] = ENTRY_TYPES.map(function (type) {
    return { value: type, label: TYPE_LABELS[type] };
});

// Default and bounds for the "how many" input; the backend enforces the same upper bound.
const DEFAULT_GENERATE_COUNT = 3;
const MAX_GENERATE_COUNT = 50;

// Options for the "what to create" dropdown: the family label (plural) maps to the singular entry type written to file.
const CREATE_TYPE_OPTIONS: { value: EntryType; label: string }[] = Object.entries(ENTRY_TYPE_BY_FAMILY).map(function ([family, entryType]) {
    return { value: entryType, label: family };
});

const SpecsEditor = function ({ defaultEntryType, specs, schemas, allTitles, highlightQuery, onChange, onGenerate, showFilters, statusFilter, onStatusFilterChange, typeFilter, onTypeFilterChange }: SpecsEditorProperties) {
    // Ids of specs currently open in edit mode. Existing specs default to review mode; only newly added specs (or
    // ones the user explicitly clicks "Edit" on) appear here.
    const [editingIds, setEditingIds] = useState<Set<string>>(function () {
        return new Set();
    });

    // Ids of specs ticked in the footer's selection checkboxes; drives the count and the batch "Apply changes" action.
    const [selectedIds, setSelectedIds] = useState<Set<string>>(function () {
        return new Set();
    });

    const { enqueue } = useActivityQueue();

    // Id of the entry briefly ring-highlighted after the file was opened from a Search result; cleared on a timer.
    const [highlightId, setHighlightId] = useState<string | null>(null);

    // The id of the first entry whose title/content/notes contains the search query, or null when there is no query or
    // no match. Drives both the scroll-to target and keeping that entry visible even under an active filter.
    const highlightMatchId = useMemo(function () {
        const needle = highlightQuery?.trim().toLowerCase();
        if (!needle) {
            return null;
        }
        const found = specs.find(function (spec) {
            return `${spec.title}\n${spec.content}\n${spec.notes}`.toLowerCase().includes(needle);
        });
        return found ? found.id : null;
    }, [highlightQuery, specs]);

    // When a match is found, scroll its card into view and ring-highlight it for a couple of seconds so the user can
    // spot the entry the search result pointed at. The card's id is set in SpecCard.
    useEffect(function () {
        if (highlightMatchId === null) {
            return undefined;
        }
        // Set the highlight inside the animation frame (not synchronously in the effect body) and scroll the card into
        // view; clear the ring after a short delay.
        const frame = requestAnimationFrame(function () {
            setHighlightId(highlightMatchId);
            document.getElementById(`spec-${highlightMatchId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        const timer = setTimeout(function () {
            setHighlightId(null);
        }, 2000);
        return function () {
            cancelAnimationFrame(frame);
            clearTimeout(timer);
        };
    }, [highlightMatchId, highlightQuery]);

    // The "Actions" popup above the footer: whether it is open. A batch apply is queued on the activity monitor, which
    // owns its progress and errors, so the popup itself holds no in-flight state.
    const [actionsOpen, setActionsOpen] = useState(false);
    const actionsReference = useRef<HTMLDivElement>(null);

    // The "Operations" popup above the footer: bulk approve / remove-approval / delete over the selected entries.
    const [operationsOpen, setOperationsOpen] = useState(false);
    const operationsReference = useRef<HTMLDivElement>(null);

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

    // While the Actions popup is open, dismiss it on an outside click or Escape.
    useEffect(function () {
        if (!actionsOpen) {
            return undefined;
        }
        const handlePointerDown = function (event: MouseEvent) {
            if (!actionsReference.current?.contains(event.target as Node)) {
                setActionsOpen(false);
            }
        };
        const handleKeyDown = function (event: KeyboardEvent) {
            if (event.key === 'Escape') {
                setActionsOpen(false);
            }
        };
        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return function () {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [actionsOpen]);

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

    const updateAt = function (index: number, next: Spec) {
        // Any edit to an existing spec flows through here, so stamp the update time and updater in one place. The
        // editor UI is only ever driven by a human, so the updater is Human; AI stamps itself when editing the file.
        const stamped = { ...next, updated: nowTimestamp(), updatedBy: 'Human' as const };
        onChange(specs.map(function (spec, position) {
            return position === index ? stamped : spec;
        }));
    };

    const removeAt = function (index: number) {
        onChange(specs.filter(function (_spec, position) {
            return position !== index;
        }));
    };

    const addSpec = function () {
        const spec = emptySpec();
        onChange([...specs, spec]);
        setEditingIds(function (previous) {
            return new Set(previous).add(spec.id); // a brand-new spec opens directly in edit mode
        });
        // After React commits the new card, bring the whole card into view and focus its content box so the user can
        // start typing right away. preventScroll keeps focus from fighting the smooth scrollIntoView positioning.
        requestAnimationFrame(function () {
            const textarea = document.getElementById(`spec-${spec.id}-content`);
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

    // A spec matches when its approval state is among the selected statuses AND its type is among the selected types.
    // An empty selection in either dimension imposes no constraint there.
    const selectedKeys = new Set(statusFilter.map(function (option) {
        return option.value;
    }));
    const selectedTypeKeys = new Set(typeFilter.map(function (option) {
        return option.value;
    }));
    const isFilterMatch = function (spec: Spec): boolean {
        const isStatusMatch = selectedKeys.size === 0 || selectedKeys.has(approvalState(spec));
        const isTypeMatch = selectedTypeKeys.size === 0 || selectedTypeKeys.has(spec.type);
        return isStatusMatch && isTypeMatch;
    };

    // Keep each spec's original index so updateAt/removeAt still address the full list after filtering. A spec being
    // edited is always shown - otherwise a freshly added spec (none/none) or one whose status just changed would
    // vanish mid-edit.
    const shown = specs
        .map(function (spec, index) {
            return { spec, index };
        })
        .filter(function ({ spec }) {
            return editingIds.has(spec.id) || spec.id === highlightMatchId || isFilterMatch(spec);
        });

    // Selected specs in document order, ignoring any stale ids whose spec was removed. The footer count and the popup
    // summary both read from this.
    const selectedSpecs = specs.filter(function (spec) {
        return selectedIds.has(spec.id);
    });

    // Queue the backend's headless agent over every selected spec as one combined "claude -p" job on the activity
    // monitor (its stdout is logged to the browser console for debugging). The popup closes as soon as the job is
    // enqueued; progress and any error live in the activity monitor.
    const handleApplyChanges = async function () {
        if (selectedSpecs.length === 0) {
            return;
        }
        const entries = selectedSpecs.map(function (spec) {
            return { title: spec.title, content: spec.content, notes: spec.notes };
        });
        const count = entries.length;
        const promise = enqueue({
            kind: 'apply-batch',
            label: `${count} ${count === 1 ? 'spec' : 'specs'}`,
            run: function (signal, onEvent) {
                return applySpecs(entries, { signal, onEvent });
            }
        });
        // Close the popup right away (synchronously, before the await); progress lives in the activity monitor. The
        // await only logs the job's stdout once it finishes.
        setActionsOpen(false);
        try {
            console.log(await promise);
        } catch (error) {
            console.error(error);
        }
    };

    // Whether every currently-shown entry is already ticked; gates the "Select all" link.
    const allShownSelected = shown.length > 0 && shown.every(function ({ spec }) {
        return selectedIds.has(spec.id);
    });

    // "Select all" ticks only the entries currently visible (a status filter may hide others), never the hidden ones.
    const selectAllShown = function () {
        setSelectedIds(new Set(shown.map(function ({ spec }) {
            return spec.id;
        })));
    };

    const deselectAll = function () {
        setSelectedIds(new Set());
    };

    // Apply a transform to every selected entry, stamping each as a fresh human edit - matching the single-card path
    // (SpecCard's onChange flows through updateAt, which stamps updated/updatedBy the same way).
    const updateSelected = function (transform: (spec: Spec) => Spec) {
        onChange(specs.map(function (spec) {
            if (!selectedIds.has(spec.id)) {
                return spec;
            }
            return { ...transform(spec), updated: nowTimestamp(), updatedBy: 'Human' as const };
        }));
    };

    const handleBulkApprove = function () {
        updateSelected(function (spec) {
            return { ...spec, approved: hashContent(spec) };
        });
        setOperationsOpen(false);
    };

    const handleBulkRemoveApproval = async function () {
        const confirmed = await confirmDialog(
            `Remove approval from ${selectedSpecs.length} ${selectedSpecs.length === 1 ? 'entry' : 'entries'}?`,
            'Remove approval'
        );
        if (!confirmed) {
            return;
        }
        updateSelected(function (spec) {
            return { ...spec, approved: '' };
        });
        setOperationsOpen(false);
    };

    const handleBulkDelete = async function () {
        const confirmed = await confirmDialog(
            `Remove ${selectedSpecs.length} ${selectedSpecs.length === 1 ? 'entry' : 'entries'}?`,
            'Remove'
        );
        if (!confirmed) {
            return;
        }
        onChange(specs.filter(function (spec) {
            return !selectedIds.has(spec.id);
        }));
        setSelectedIds(new Set());
        setOperationsOpen(false);
    };

    return (
        <div className={styles.specsEditor}>
            <div className={styles.scrollArea}>
                {specs.length > 0 && (showFilters || statusFilter.length > 0 || typeFilter.length > 0) &&
                <div className={styles.specFilter}>
                    {(statusFilter.length > 0 || typeFilter.length > 0) &&
                    <span className={cx(styles.filterCount, styles.muted)}>{shown.length} of {specs.length} shown</span>}
                    {showFilters &&
                    <Select<Option, true>
                        classNamePrefix="rs"
                        isMulti
                        placeholder="Approval status"
                        aria-label="Filter specs by approval status"
                        options={FILTER_OPTIONS}
                        value={statusFilter}
                        onChange={function (options: MultiValue<Option>) {
                            onStatusFilterChange([...options]);
                        }}
                    />}
                    {showFilters &&
                    <Select<Option, true>
                        classNamePrefix="rs"
                        isMulti
                        placeholder="Entry type"
                        aria-label="Filter specs by entry type"
                        options={TYPE_FILTER_OPTIONS}
                        value={typeFilter}
                        onChange={function (options: MultiValue<Option>) {
                            onTypeFilterChange([...options]);
                        }}
                    />}
                </div>}

                {specs.length === 0 && <p className={styles.placeholder}>No specs yet. Add one to get started.</p>}

                {specs.length > 0 && shown.length === 0 &&
                <p className={styles.placeholder}>No specs match the selected filters.</p>}

                {shown.map(function ({ spec, index }) {
                    return (
                        <SpecCard
                            key={spec.id}
                            index={index}
                            mode={editingIds.has(spec.id) ? 'edit' : 'review'}
                            highlighted={spec.id === highlightId}
                            value={spec}
                            schemas={schemas}
                            allTitles={allTitles}
                            onChange={function (next) {
                                updateAt(index, next);
                            }}
                            onToggleMode={function () {
                                toggleMode(spec.id);
                            }}
                            onRemove={function () {
                                removeAt(index);
                            }}
                            selected={selectedIds.has(spec.id)}
                            onToggleSelect={function () {
                                toggleSelect(spec.id);
                            }}
                        />
                    );
                })}
            </div>

            {specs.length > 0 &&
            <div className={styles.footer}>
                <span className={styles.footerCount}>
                    {selectedSpecs.length > 0 ?
                        `${selectedSpecs.length}/${specs.length} entries selected` :
                        `${specs.length} entries`}
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
                    disabled={selectedSpecs.length === 0}
                    onClick={deselectAll}
                >
                    Deselect all
                </button>
                <div className={styles.actionsAnchor} ref={operationsReference}>
                    {operationsOpen &&
                    <div className={styles.actionsPopup}>
                        <p className={styles.actionsHeader}>{selectedSpecs.length} entries selected</p>
                        <button type="button" className={styles.operationButton} onClick={handleBulkApprove}>Approve</button>
                        <button type="button" className={styles.operationButton} onClick={handleBulkRemoveApproval}>Remove Approval</button>
                        <button type="button" className={cx(styles.operationButton, styles.operationDanger)} onClick={handleBulkDelete}>Delete</button>
                    </div>}
                    <button
                        type="button"
                        className={styles.actionsButton}
                        disabled={selectedSpecs.length === 0}
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
                        <p className={styles.actionsHeader}>{selectedSpecs.length} entries selected</p>
                        <ul className={styles.actionsTitleList}>
                            {selectedSpecs.map(function (spec) {
                                return <li key={spec.id}>{spec.title || '(untitled)'}</li>;
                            })}
                        </ul>
                        <button
                            type="button"
                            className={styles.aiSubmit}
                            disabled={selectedSpecs.length === 0}
                            onClick={handleApplyChanges}
                        >
                            Apply changes
                        </button>
                    </div>}
                    <button
                        type="button"
                        className={styles.actionsButton}
                        disabled={selectedSpecs.length === 0}
                        aria-expanded={actionsOpen}
                        onClick={function () {
                            setOperationsOpen(false);
                            setActionsOpen(function (previous) {
                                return !previous;
                            });
                        }}
                    >
                        Actions
                    </button>
                </div>
                <div ref={speedDialReference} className={styles.speedDial}>
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
                                addSpec();
                            }}
                        >
                            <PlusIcon /><span>Create manually</span>
                        </button>
                    </div>}

                    <button
                        type="button"
                        className={styles.fab}
                        aria-label={menuOpen ? 'Close menu' : 'Add spec'}
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
            </div>}

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

export { SpecsEditor };
export type { Option };
