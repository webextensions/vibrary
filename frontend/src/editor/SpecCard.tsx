import cx from 'classnames';
import { type ReactNode, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MultiValue } from 'react-select';
import Select from 'react-select';
import CreatableSelect from 'react-select/creatable';
import { toast } from 'react-toastify';

import { useActivityQueueActions } from '../activity/activityQueue.ts';
import { populateTitle } from '../api.ts';
import { confirmDialog } from '../shared/confirmDialog.ts';
import { copyText } from '../shared/copyText.ts';
import { danglingRelations } from './danglingRelations.ts';
import { type SchemaMap } from './loadVibraryFile.ts';
import { specToMarkdown } from './specMarkdown.ts';
import { uniqueTitle } from './uniqueTitle.ts';
import { AGENTS, ENTRY_TYPES, type EntryType, hashContent, normalizeTitle, type Spec } from '../xml/vibraryXml.ts';

import { ApprovedBy } from './ApprovedBy.tsx';
import { ApproveIcon, ChevronIcon, ClickIcon, CopyIcon, EditIcon, PlusIcon, RemoveIcon, TypeIcon } from '../shared/Icons.tsx';
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
    // Titles across every file, from the last-saved server summary; backs the "Relates to" option list.
    allTitles: string[];
    // Every title a new one must avoid: allTitles UNIONED with this file's LIVE (in-memory, possibly unsaved) titles.
    // The duplicate-title warning is computed from the in-memory entries, so the "Make unique" fix has to see them too
    // - checking only the saved allTitles would find no collision for two freshly-typed duplicates and silently no-op.
    takenTitles: string[];
    // Navigate to the entry a clicked "Relates to" chip points at (which may live in a different file).
    onOpenRelated: (title: string) => void;
    // Toggle a clicked label chip into/out of the active label filter.
    onLabelClick: (label: string) => void;
    onChange: (next: Spec) => void;
    onToggleMode: () => void;
    onRemove: () => void;
    onDuplicate: () => void;
    selected: boolean;
    onToggleSelect: () => void;
    // Whether this card's extra-fields section (notes/labels/relates-to/metadata/run) is open. Lifted to the editor so
    // a single "Expand all / Collapse all" control can drive every card at once.
    expanded: boolean;
    onToggleExpand: () => void;
    // Reorder controls. Disabled (hidden) while a filter is active, since moving relative to hidden entries is
    // ambiguous; canMoveUp/canMoveDown gate the buttons at the list ends.
    reorderable: boolean;
    canMoveUp: boolean;
    canMoveDown: boolean;
    onMoveUp: () => void;
    onMoveDown: () => void
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

// Whitespace-delimited word count, 0 for blank/whitespace-only text. Backs the content field's live counter in edit
// mode; a rough writing gauge, not a linguistic tokenizer.
const countWords = function (text: string): number {
    const trimmed = text.trim();
    return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
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
// whichever action onItemClick performs. isDangling (used by Relates to) marks an item whose target does not exist:
// it renders as an inert amber chip with a broken-reference tooltip instead of a navigable button.
const Chips = function (
    { items, onItemClick, titleFor, isDangling }:
    { items: string[]; onItemClick?: (item: string) => void; titleFor?: (item: string) => string; isDangling?: (item: string) => boolean }
) {
    if (items.length === 0) {
        return <span className={styles.muted}>-</span>;
    }
    return (
        <span className={styles.chips}>
            {items.map(function (item) {
                if (isDangling?.(item)) {
                    return (
                        <span
                            key={item}
                            className={cx(styles.chip, styles.chipDangling)}
                            title={`No entry is titled "${item}" - this reference points to nothing (its target was renamed or removed).`}
                        >
                            {item}
                        </span>
                    );
                }
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

const SpecCard = function ({ value, index, mode, highlighted = false, hasDuplicateTitle = false, schemas, allTitles, takenTitles, onOpenRelated, onLabelClick, onChange, onToggleMode, onRemove, onDuplicate, selected, onToggleSelect, expanded, onToggleExpand, reorderable, canMoveUp, canMoveDown, onMoveUp, onMoveDown }: SpecCardProperties) {
    const isEditing = mode === 'edit';
    const { enqueue } = useActivityQueueActions();
    const [populating, setPopulating] = useState(false);

    // Clamp a long entry's review-mode content to a preview so one wall-of-text entry cannot dominate the list, with a
    // "Show more" toggle to reveal the rest. Short entries never fill the clamp, so they render unchanged and get no
    // toggle. Overflow is measured against the clamped box, and only while collapsed: once expanded the box grows to fit
    // the text, so a re-measure there would read "no overflow" and wrongly hide the "Show less" control.
    const contentReference = useRef<HTMLSpanElement>(null);
    const [contentOverflows, setContentOverflows] = useState(false);
    const [contentExpanded, setContentExpanded] = useState(false);
    useLayoutEffect(function () {
        if (contentExpanded) {
            return;
        }
        const element = contentReference.current;
        if (element !== null) {
            setContentOverflows(element.scrollHeight > element.clientHeight + 1);
        }
    }, [value.content, contentExpanded, isEditing]);

    // When this card becomes the target of a Search jump, reveal its full content so a match sitting past the clamp is
    // not hidden behind "Show more". Latched with the previous-value pattern (adjust state during render, not in an
    // effect) so the reveal survives the ring highlight clearing on its 2s timer instead of collapsing out from under
    // the reader; they can Show less again. A short entry has no clamp, so this is a no-op there.
    const [wasSearchTarget, setWasSearchTarget] = useState(false);
    if (highlighted !== wasSearchTarget) {
        setWasSearchTarget(highlighted);
        if (highlighted) {
            setContentExpanded(true);
        }
    }

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

    // Which of this entry's relatesTo references point to no existing entry (broken links). takenTitles is every title
    // that exists folder-wide plus the open file's live entries, so a reference outside it resolves to nothing.
    const danglingReferences = useMemo(function () {
        return new Set(danglingRelations(value.relatesTo, new Set(takenTitles)));
    }, [value.relatesTo, takenTitles]);

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

    // Copy this entry to the clipboard as readable Markdown, for pasting into a PR, doc, or chat. copyText falls back
    // to the legacy path on a plain-HTTP LAN origin where the async Clipboard API is absent (the phone case).
    const handleCopyMarkdown = async function () {
        const copied = await copyText(specToMarkdown(value));
        if (copied) {
            toast.success('Copied as Markdown');
        } else {
            toast.error('Could not copy to the clipboard');
        }
    };

    // Confirm before deleting the whole spec - the confirm guards intent; the editor then offers a brief Undo toast for
    // actual recovery.
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
        <fieldset id={`spec-${value.id}`} data-spec-id={value.id} className={cx(styles.specCard, highlighted && styles.highlighted)}>
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
                        onClick={onToggleExpand}
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
                        title="Another entry - in this file or another - has the same title. Titles are how entries reference each other (relatesTo), so a duplicated title makes those references ambiguous."
                    >
                        duplicate title
                        <button
                            type="button"
                            className={styles.duplicateTitleFix}
                            title="Append a numeric suffix to make this title unique across the folder"
                            onClick={function () {
                                update({ title: uniqueTitle(value.title, takenTitles) });
                            }}
                        >
                            Make unique
                        </button>
                    </span>}
                    {danglingReferences.size > 0 &&
                    <span
                        className={styles.danglingRefsWarning}
                        title={`Points to no entry: ${[...danglingReferences].join(', ')}. These "Relates to" reference${danglingReferences.size === 1 ? '' : 's'} resolve to nothing (their targets were renamed or removed).`}
                    >
                        {danglingReferences.size} broken {danglingReferences.size === 1 ? 'reference' : 'references'}
                        <button
                            type="button"
                            className={styles.danglingRefsFix}
                            title="Remove the broken references from this entry"
                            onClick={function () {
                                update({ relatesTo: value.relatesTo.filter(function (title) { return !danglingReferences.has(title); }) });
                            }}
                        >
                            Remove
                        </button>
                    </span>}
                </div>
                <div className={styles.specCardActions}>
                    {reorderable &&
                    <span className={styles.reorder}>
                        <button type="button" className={cx(styles.reorderButton, styles.reorderUp)} aria-label="Move entry up" title="Move up" disabled={!canMoveUp} onClick={onMoveUp}>
                            <ChevronIcon />
                        </button>
                        <button type="button" className={cx(styles.reorderButton, styles.reorderDown)} aria-label="Move entry down" title="Move down" disabled={!canMoveDown} onClick={onMoveDown}>
                            <ChevronIcon />
                        </button>
                    </span>}
                    <button type="button" className={styles.remove} onClick={confirmRemove}>
                        <RemoveIcon /><span className={styles.actionText}>Remove</span>
                    </button>
                    <button type="button" className={styles.edit} onClick={onToggleMode}>
                        <EditIcon /><span className={styles.actionText}>{isEditing ? 'Done' : 'Edit'}</span>
                    </button>
                    <button type="button" className={styles.copy} title="Copy this entry as Markdown" onClick={handleCopyMarkdown}>
                        <CopyIcon /><span className={styles.actionText}>Copy</span>
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
                            <>
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
                                <span className={styles.contentMeta}>{countWords(value.content)} words, {value.content.length} chars</span>
                            </>
                        ) :
                        (
                            <>
                                <span
                                    ref={contentReference}
                                    className={cx(styles.multiline, !contentExpanded && styles.clamped)}
                                >
                                    {orDash(value.content)}
                                </span>
                                {contentOverflows &&
                                <button
                                    type="button"
                                    className={styles.contentToggle}
                                    aria-expanded={contentExpanded}
                                    onClick={function () {
                                        setContentExpanded(function (previous) { return !previous; });
                                    }}
                                >
                                    {contentExpanded ? 'Show less' : 'Show more'}
                                </button>}
                            </>
                        )}
                </div>

                {expanded &&
                <div className={styles.specMore}>
                    <Row label="Type" htmlFor={isEditing ? fieldId('type') : undefined} inline>
                        {isEditing ?
                            (
                                <select
                                    id={fieldId('type')}
                                    className={styles.typeSelect}
                                    value={value.type}
                                    onChange={function (changeEvent) {
                                        update({ type: changeEvent.target.value as EntryType });
                                    }}
                                >
                                    {ENTRY_TYPES.map(function (entryType) {
                                        return <option key={entryType} value={entryType}>{entryType}</option>;
                                    })}
                                </select>
                            ) :
                            <span>{value.type}</span>}
                    </Row>

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
                                isDangling={function (title) { return danglingReferences.has(title); }}
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
