import cx from 'classnames';
import { useRef, useState } from 'react';
import type { MultiValue } from 'react-select';
import Select from 'react-select';

import { approvalState, type ApprovalState, emptyTruth, nowTimestamp, type Truth } from '../truthsXml.ts';
import { useScrollVisibility } from '../useScrollVisibility.ts';

import { PlusIcon } from './Icons.tsx';
import { TruthCard } from './TruthCard.tsx';

import styles from './TruthsEditor.module.css';

type Option = { value: string; label: string };

type TruthsEditorProperties = {
    truths: Truth[];
    allTitles: string[];
    onChange: (next: Truth[]) => void;
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

const TruthsEditor = function ({ truths, allTitles, onChange, showFilters, statusFilter, onStatusFilterChange }: TruthsEditorProperties) {
    // Ids of truths currently open in edit mode. Existing truths default to review mode; only newly added truths (or
    // ones the user explicitly clicks "Edit" on) appear here.
    const [editingIds, setEditingIds] = useState<Set<string>>(function () {
        return new Set();
    });

    // The scrolling list element; the floating add button hides when scrolling down it and reappears when scrolling up.
    const scrollReference = useRef<HTMLDivElement>(null);
    const fabVisible = useScrollVisibility(scrollReference);

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

            <button
                type="button"
                className={cx(styles.fab, { [styles.fabHidden]: !fabVisible })}
                aria-label="Add truth"
                onClick={addTruth}
            >
                <PlusIcon />
            </button>
        </div>
    );
};

export { TruthsEditor };
export type { Option };
