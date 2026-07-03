import cx from 'classnames';
import { type ReactNode, useState } from 'react';
import type { MultiValue } from 'react-select';
import Select from 'react-select';
import CreatableSelect from 'react-select/creatable';

import { useActivityQueueActions } from '../activity/activityQueue.ts';
import { populateTitle } from '../api.ts';
import { confirmDialog } from '../shared/confirmDialog.ts';
import { type SchemaMap } from '../loadVibraryFile.ts';
import { AGENTS, hashContent, normalizeTitle, type Spec } from '../xml/vibraryXml.ts';

import { ApprovedBy } from './ApprovedBy.tsx';
import { ApproveIcon, ChevronIcon, ClickIcon, EditIcon, PlusIcon, RemoveIcon, TypeIcon } from '../shared/Icons.tsx';
import { RunActionSection } from './RunActionSection.tsx';

import formStyles from './forms.module.css';
import styles from './SpecCard.module.css';

type Option = { value: string; label: string };

type Mode = 'review' | 'edit';

type SpecCardProperties = {
    value: Spec;
    index: number;
    mode: Mode;
    // Briefly true after the card is scrolled to from a Search result, to ring-highlight it.
    highlighted?: boolean;
    // Another entry in this file bears the same title; references by that title are ambiguous, so the card says so.
    hasDuplicateTitle?: boolean;
    schemas: SchemaMap;
    allTitles: string[];
    // Navigate to the entry a clicked "Relates to" chip points at (which may live in a different file).
    onOpenRelated: (title: string) => void;
    // Toggle a clicked label chip into/out of the active label filter.
    onLabelClick: (label: string) => void;
    onChange: (next: Spec) => void;
    onToggleMode: () => void;
    onRemove: () => void;
    onDuplicate: () => void;
    selected: boolean;
    onToggleSelect: () => void
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
        <div className={cx(styles.specRow, inline && styles.specRowInline)}>
            {htmlFor === undefined ?
                <span className={styles.rowLabel}>{label}</span> :
                <label className={styles.rowLabel} htmlFor={htmlFor}>{label}</label>}
            <div className={styles.rowContent}>{children}</div>
        </div>
    );
};

// Plain read-only tags by default; when onItemClick is given, each chip becomes a button instead (Relates to
// navigates to the referenced entry, a label toggles the label filter) - titleFor supplies the hover text for
// whichever action onItemClick performs.
const Chips = function (
    { items, onItemClick, titleFor }:
    { items: string[]; onItemClick?: (item: string) => void; titleFor?: (item: string) => string }
) {
    if (items.length === 0) {
        return <span className={styles.muted}>-</span>;
    }
    return (
        <span className={styles.chips}>
            {items.map(function (item) {
                return onItemClick ?
                    (
                        <button
                            key={item}
                            type="button"
                            className={cx(styles.chip, styles.chipLink)}
                            title={titleFor?.(item)}
                            onClick={function () {
                                onItemClick(item);
                            }}
                        >
                            {item}
                        </button>
                    ) :
                    <span key={item} className={styles.chip}>{item}</span>;
            })}
        </span>
    );
};

const SpecCard = function ({ value, index, mode, highlighted = false, hasDuplicateTitle = false, schemas, allTitles, onOpenRelated, onLabelClick, onChange, onToggleMode, onRemove, onDuplicate, selected, onToggleSelect }: SpecCardProperties) {
    const isEditing = mode === 'edit';
    const { enqueue } = useActivityQueueActions();
    const [expanded, setExpanded] = useState(false);
    const [populating, setPopulating] = useState(false);

    const update = function (patch: Partial<Spec>) {
        onChange({ ...value, ...patch });
    };

    // Derive the hyphenated-title from the content below by asking the backend's headless "claude -p" agent, then drop
    // the result into the title field. Uses the in-memory content (current edits), so no save is needed first.
    const handlePopulate = async function () {
        if (populating || value.content.trim() === '') {
            return;
        }
        setPopulating(true);
        try {
            const title = await enqueue({
                kind: 'title',
                label: value.title || 'derive title',
                run: function (signal) {
                    return populateTitle(value.content, signal);
                }
            });
            if (title !== '') {
                update({ title });
            }
        } catch (error) {
            console.error(`[vibrary] failed to derive title for "${value.title || value.id}":`, error);
        } finally {
            setPopulating(false);
        }
    };

    const fieldId = function (name: string) {
        return `spec-${value.id}-${name}`;
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

    // Set the human approval, confirming first whenever the change clears an existing approval (stale or current) -
    // removing a deliberate sign-off should never happen silently. Approving (or clearing when there was nothing to
    // clear) applies immediately. Shared by both approval controls - the header button and the "Approved" Yes/No
    // radio - so neither can drift into skipping the confirm the other enforces.
    const handleApprovedByChange = async function (next: string) {
        if (value.approved !== '' && next === '') {
            const confirmed = await confirmDialog(
                `Remove your approval from this ${value.type}?`,
                'Remove approval'
            );
            if (!confirmed) {
                return;
            }
        }
        update({ approved: next });
    };

    // Three-way action on the human approval, as a one-click header button mirroring the "Approved" Yes/No control.
    // - stale: reapprove against the current content (no confirm - it only re-affirms a sign-off).
    // - approved and current: remove the approval, via the same confirm-guarded path as the radio.
    // - not approved: approve, storing the current content hash.
    const toggleApprove = async function () {
        if (isHumanApproved && !isHumanStale) {
            await handleApprovedByChange('');
            return;
        }
        update({ approved: currentHash });
    };

    // Confirm before deleting the whole spec - removal is destructive and not undoable.
    const confirmRemove = async function () {
        const confirmed = await confirmDialog(
            `Remove this ${value.type}?`,
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
        <fieldset id={`spec-${value.id}`} className={cx(styles.specCard, highlighted && styles.highlighted)}>
            <div className={styles.specCardHead}>
                <input
                    type="checkbox"
                    className={styles.selectCheckbox}
                    checked={selected}
                    // Name the entry (mirroring the sidebar's "Select <file>" checkboxes): a list of checkboxes all
                    // announcing just "Select entry" is indistinguishable to a screen-reader user.
                    aria-label={`Select ${value.title || `untitled ${value.type} #${index + 1}`}`}
                    onChange={onToggleSelect}
                />
                <div className={styles.specCardTitleGroup}>
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
                    <span className={styles.typeIcon} title={value.type}>
                        <TypeIcon type={value.type} />
                    </span>
                    {isEditing ?
                        (
                            <>
                                <input
                                    className={styles.titleInput}
                                    type="text"
                                    value={value.title}
                                    placeholder="hyphenated-title"
                                    aria-label="Entry title"
                                    onChange={function (changeEvent) {
                                        update({ title: changeEvent.target.value });
                                    }}
                                    onBlur={function (blurEvent) {
                                        const normalized = normalizeTitle(blurEvent.target.value);
                                        if (normalized !== value.title) {
                                            update({ title: normalized });
                                        }
                                    }}
                                />
                                <button
                                    type="button"
                                    className={styles.populate}
                                    disabled={populating || value.content.trim() === ''}
                                    title="Populate the title from the content below"
                                    onClick={handlePopulate}
                                >
                                    {populating && <span className={styles.spinner} aria-hidden="true" />}
                                    {populating ? 'Populating...' : 'Populate'}
                                </button>
                            </>
                        ) :
                        (
                            <span className={styles.specCardTitle}>{value.title || `(untitled ${value.type} #${index + 1})`}</span>
                        )}
                    {hasDuplicateTitle &&
                    <span
                        className={styles.duplicateTitleWarning}
                        title="Another entry in this file has the same title. Titles are how entries reference each other (relatesTo), so a duplicated title makes those references ambiguous."
                    >
                        duplicate title
                    </span>}
                </div>
                <div className={styles.specCardActions}>
                    <button type="button" className={styles.remove} onClick={confirmRemove}>
                        <RemoveIcon /><span className={styles.actionText}>Remove</span>
                    </button>
                    <button type="button" className={styles.edit} onClick={onToggleMode}>
                        <EditIcon /><span className={styles.actionText}>{isEditing ? 'Done' : 'Edit'}</span>
                    </button>
                    <button type="button" className={styles.duplicate} title="Duplicate this entry" onClick={onDuplicate}>
                        <PlusIcon /><span className={styles.actionText}>Duplicate</span>
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

            <div className={styles.specFields}>
                <div className={styles.specContent}>
                    {isEditing ?
                        (
                            <textarea
                                id={fieldId('content')}
                                aria-label="Entry content"
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
                <div className={styles.specMore}>
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
                            <Chips
                                items={value.labels}
                                onItemClick={onLabelClick}
                                titleFor={function (label) { return `Filter by "${label}"`; }}
                            />}
                    </Row>

                    <Row label="Relates to" htmlFor={isEditing ? fieldId('relates-to') : undefined}>
                        {isEditing ?
                            (
                                <Select<Option, true>
                                    inputId={fieldId('relates-to')}
                                    classNamePrefix="rs"
                                    isMulti
                                    placeholder="Search specs..."
                                    options={relatesToOptions}
                                    value={toOptions(value.relatesTo)}
                                    onChange={function (options: MultiValue<Option>) {
                                        update({ relatesTo: fromOptions(options) });
                                    }}
                                />
                            ) :
                            <Chips
                                items={value.relatesTo}
                                onItemClick={onOpenRelated}
                                titleFor={function (title) { return `Go to "${title}"`; }}
                            />}
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

                    <Row label="Approved" inline>
                        <ApprovedBy
                            idPrefix={value.id}
                            value={value.approved}
                            contentHash={currentHash}
                            isEditing={isEditing}
                            onChange={function (next) {
                                void handleApprovedByChange(next);
                            }}
                        />
                    </Row>

                    <Row label="Created" inline>
                        <span className={styles.muted} title={value.created}>{formatTimestamp(value.created)}</span>
                    </Row>

                    <Row label="Updated" inline>
                        <span className={styles.muted} title={value.updated}>{formatTimestamp(value.updated)}</span>
                    </Row>

                    <Row label="Updated by" inline>
                        <span className={styles.muted}>{orDash(value.updatedBy)}</span>
                    </Row>

                    <RunActionSection value={value} schemas={schemas} />
                </div>}
            </div>
        </fieldset>
    );
};

export { SpecCard };
