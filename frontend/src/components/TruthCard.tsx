import cx from 'classnames';
import { type ReactNode, useState } from 'react';
import type { MultiValue } from 'react-select';
import Select from 'react-select';
import CreatableSelect from 'react-select/creatable';

import { applyTruth } from '../api.ts';
import { confirmDialog } from '../confirmDialog.ts';
import { promptDialog } from '../promptDialog.ts';
import { AGENTS, hashContent, type Truth } from '../truthsXml.ts';

import { ApprovedBy } from './ApprovedBy.tsx';
import { ApproveIcon, ChevronIcon, ClickIcon, EditIcon, RemoveIcon } from './Icons.tsx';

import formStyles from './forms.module.css';
import styles from './TruthCard.module.css';

type Option = { value: string; label: string };

type Mode = 'review' | 'edit';

type TruthCardProperties = {
    value: Truth;
    index: number;
    mode: Mode;
    allTitles: string[];
    onChange: (next: Truth) => void;
    onToggleMode: () => void;
    onRemove: () => void
};

const toOptions = function (values: string[]): Option[] {
    return values.map(function (value) {
        return { value, label: value };
    });
};

const fromOptions = function (options: readonly Option[]): string[] {
    return options.map(function (option) {
        return option.value;
    });
};

const orDash = function (text: string): string {
    return text === '' ? '-' : text;
};

// Render an ISO 8601 timestamp in the viewer's locale; fall back to the raw value if it is not a valid date.
const formatTimestamp = function (iso: string): string {
    if (iso === '') {
        return '-';
    }
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
};

// A single label-left row. The same wrapper is used in both modes so the layout does not shift when toggling.
// `inline` keeps the label beside its value even on narrow screens, for short-valued rows that need not stack.
const Row = function (
    { label, htmlFor, inline = false, children }:
    { label: string; htmlFor?: string; inline?: boolean; children: ReactNode }
) {
    return (
        <div className={cx(styles.truthRow, inline && styles.truthRowInline)}>
            {htmlFor === undefined ?
                <span className={styles.rowLabel}>{label}</span> :
                <label className={styles.rowLabel} htmlFor={htmlFor}>{label}</label>}
            <div className={styles.rowContent}>{children}</div>
        </div>
    );
};

const Chips = function ({ items }: { items: string[] }) {
    if (items.length === 0) {
        return <span className={styles.muted}>-</span>;
    }
    return (
        <span className={styles.chips}>
            {items.map(function (item) {
                return <span key={item} className={styles.chip}>{item}</span>;
            })}
        </span>
    );
};

const TruthCard = function ({ value, index, mode, allTitles, onChange, onToggleMode, onRemove }: TruthCardProperties) {
    const isEditing = mode === 'edit';
    const [expanded, setExpanded] = useState(false);
    const [applying, setApplying] = useState(false);
    const [useCustomInstructions, setUseCustomInstructions] = useState(false);

    const update = function (patch: Partial<Truth>) {
        onChange({ ...value, ...patch });
    };

    // Run the headless agent that makes the codebase conform to this truth. Uses the in-memory value (current edits), so
    // no save is needed first. The agent's raw stdout is logged to the browser console for debugging. When "Provide
    // custom one time instructions" is ticked, prompt first and forward the entered text to this single run; cancelling
    // (or leaving it blank) aborts the apply rather than running without the instructions the user opted to give.
    const handleApply = async function () {
        if (applying) {
            return;
        }
        let instructions = '';
        if (useCustomInstructions) {
            const entered = await promptDialog({
                message: 'Custom one-time instructions for this run:',
                placeholder: 'e.g. focus on the backend only, skip tests',
                confirmLabel: 'Apply this truth'
            });
            if (entered === null) {
                return;
            }
            instructions = entered;
        }
        setApplying(true);
        try {
            const output = await applyTruth({ title: value.title, content: value.content, notes: value.notes, instructions });
            console.log(output);
        } catch (error) {
            console.error(error);
        } finally {
            setApplying(false);
        }
    };

    const fieldId = function (name: string) {
        return `truth-${value.id}-${name}`;
    };

    const relatesToOptions = toOptions(allTitles.filter(function (title) {
        return title !== value.title;
    }));

    // Hash of the current content; the human approval stores the hash it was signed off against. A stored hash that no
    // longer matches means the content changed since approval (stale), surfaced as a yellow "Reapprove" button.
    const currentHash = hashContent(value);
    const humanHash = value.approved;
    const isHumanApproved = humanHash !== '';
    const isHumanStale = isHumanApproved && humanHash !== currentHash;

    // Three-way action on the human approval. Mirrors the "Approved by" checkbox as a one-click action.
    // - stale: reapprove against the current content (no confirm - it only re-affirms a sign-off).
    // - approved and current: remove the approval, confirmed first since it undoes a deliberate sign-off.
    // - not approved: approve, storing the current content hash.
    const toggleApprove = async function () {
        if (isHumanApproved && !isHumanStale) {
            const confirmed = await confirmDialog(
                'Remove your approval from this truth?',
                'Remove approval'
            );
            if (!confirmed) {
                return;
            }
            update({ approved: '' });
            return;
        }
        update({ approved: currentHash });
    };

    // Confirm before deleting the whole truth - removal is destructive and not undoable.
    const confirmRemove = async function () {
        const confirmed = await confirmDialog(
            'Remove this truth?',
            'Remove'
        );
        if (confirmed) {
            onRemove();
        }
    };

    const approveClassName = cx(styles.approve, isHumanStale && styles.reapprove, isHumanApproved && !isHumanStale && styles.approved);
    const approveLabel = isHumanStale ? 'Reapprove' : (isHumanApproved ? 'Approved' : 'Approve');
    const isApprovedFresh = isHumanApproved && !isHumanStale;
    const approveTitle = isHumanStale ?
        `Approved against content ${humanHash}; content is now ${currentHash}. Reapprove to confirm the current text.` :
        undefined;

    return (
        <fieldset className={styles.truthCard}>
            <div className={styles.truthCardHead}>
                <div className={styles.truthCardTitleGroup}>
                    <button
                        type="button"
                        className={styles.expandToggle}
                        aria-expanded={expanded}
                        aria-label={expanded ? 'Collapse extra fields' : 'Expand extra fields'}
                        onClick={function () {
                            setExpanded(function (open) {
                                return !open;
                            });
                        }}
                    >
                        <ChevronIcon />
                    </button>
                    {isEditing ?
                        (
                            <input
                                className={styles.titleInput}
                                type="text"
                                value={value.title}
                                placeholder="hyphenated-title"
                                aria-label="Truth title"
                                onChange={function (changeEvent) {
                                    update({ title: changeEvent.target.value });
                                }}
                                onBlur={function (blurEvent) {
                                    const normalized = blurEvent.target.value.trim().toLowerCase().replaceAll(/\s+/g, '-');
                                    if (normalized !== value.title) {
                                        update({ title: normalized });
                                    }
                                }}
                            />
                        ) :
                        (
                            <span className={styles.truthCardTitle}>{value.title || `(untitled truth #${index + 1})`}</span>
                        )}
                </div>
                <div className={styles.truthCardActions}>
                    <button type="button" className={styles.remove} onClick={confirmRemove}>
                        <RemoveIcon /><span className={styles.actionText}>Remove</span>
                    </button>
                    <button type="button" className={styles.edit} onClick={onToggleMode}>
                        <EditIcon /><span className={styles.actionText}>{isEditing ? 'Done' : 'Edit'}</span>
                    </button>
                    <button
                        type="button"
                        className={approveClassName}
                        title={approveTitle}
                        onClick={toggleApprove}
                    >
                        {isApprovedFresh ? <ApproveIcon /> : <ClickIcon />}{approveLabel}
                    </button>
                </div>
            </div>

            <div className={styles.truthFields}>
                <div className={styles.truthContent}>
                    {isEditing ?
                        (
                            <textarea
                                id={fieldId('content')}
                                aria-label="Truth content"
                                value={value.content}
                                spellCheck={false}
                                onChange={function (changeEvent) {
                                    const next = changeEvent.target.value;
                                    update({ content: next, contentHash: hashContent({ ...value, content: next }) });
                                }}
                            />
                        ) :
                        <span className={styles.multiline}>{orDash(value.content)}</span>}
                </div>

                {expanded &&
                <div className={styles.truthMore}>
                    <Row label="Notes" htmlFor={isEditing ? fieldId('notes') : undefined}>
                        {isEditing ?
                            (
                                <textarea
                                    id={fieldId('notes')}
                                    value={value.notes}
                                    spellCheck={false}
                                    onChange={function (changeEvent) {
                                        update({ notes: changeEvent.target.value });
                                    }}
                                />
                            ) :
                            <span className={styles.multiline}>{orDash(value.notes)}</span>}
                    </Row>

                    <Row label="Labels" htmlFor={isEditing ? fieldId('labels') : undefined}>
                        {isEditing ?
                            (
                                <CreatableSelect<Option, true>
                                    inputId={fieldId('labels')}
                                    classNamePrefix="rs"
                                    isMulti
                                    placeholder="Add labels..."
                                    value={toOptions(value.labels)}
                                    onChange={function (options: MultiValue<Option>) {
                                        update({ labels: fromOptions(options) });
                                    }}
                                />
                            ) :
                            <Chips items={value.labels} />}
                    </Row>

                    <Row label="Relates to" htmlFor={isEditing ? fieldId('relates-to') : undefined}>
                        {isEditing ?
                            (
                                <Select<Option, true>
                                    inputId={fieldId('relates-to')}
                                    classNamePrefix="rs"
                                    isMulti
                                    placeholder="Search truths..."
                                    options={relatesToOptions}
                                    value={toOptions(value.relatesTo)}
                                    onChange={function (options: MultiValue<Option>) {
                                        update({ relatesTo: fromOptions(options) });
                                    }}
                                />
                            ) :
                            <Chips items={value.relatesTo} />}
                    </Row>

                    <Row label="Created by" inline>
                        {isEditing ?
                            (
                                <div className={formStyles.radioGroup}>
                                    {AGENTS.map(function (agent) {
                                        const radioId = fieldId(`created-by-${agent}`);
                                        return (
                                            <label key={agent} className={formStyles.radio} htmlFor={radioId}>
                                                <input
                                                    id={radioId}
                                                    type="radio"
                                                    name={fieldId('created-by')}
                                                    checked={value.createdBy === agent}
                                                    onChange={function () {
                                                        update({ createdBy: agent });
                                                    }}
                                                    onClick={function () {
                                                        // Click the already-selected radio to clear it back to unset.
                                                        if (value.createdBy === agent) {
                                                            update({ createdBy: '' });
                                                        }
                                                    }}
                                                />
                                                {agent}
                                            </label>
                                        );
                                    })}
                                </div>
                            ) :
                            <span>{orDash(value.createdBy)}</span>}
                    </Row>

                    <Row label="Approved by" inline>
                        <ApprovedBy
                            idPrefix={value.id}
                            value={value.approved}
                            contentHash={currentHash}
                            onChange={function (next) {
                                update({ approved: next });
                            }}
                        />
                    </Row>

                    <Row label="Created" inline>
                        <span className={styles.muted} title={value.created}>{formatTimestamp(value.created)}</span>
                    </Row>

                    <Row label="Updated" inline>
                        <span className={styles.muted} title={value.lastUpdated}>{formatTimestamp(value.lastUpdated)}</span>
                    </Row>

                    <Row label="Updated by" inline>
                        <span className={styles.muted}>{orDash(value.updatedBy)}</span>
                    </Row>

                    <div className={styles.applyRow}>
                        <button
                            type="button"
                            className={styles.apply}
                            disabled={applying}
                            onClick={handleApply}
                        >
                            {applying && <span className={styles.spinner} aria-hidden="true" />}
                            {applying ? 'Applying...' : 'Apply this truth'}
                        </button>
                        <label className={formStyles.checkbox} htmlFor={fieldId('custom-instructions')}>
                            <input
                                id={fieldId('custom-instructions')}
                                type="checkbox"
                                checked={useCustomInstructions}
                                onChange={function (changeEvent) {
                                    setUseCustomInstructions(changeEvent.target.checked);
                                }}
                            />
                            Provide custom one time instructions
                        </label>
                    </div>
                </div>}
            </div>
        </fieldset>
    );
};

export { TruthCard };
