import type { RJSFSchema } from '@rjsf/utils';
import cx from 'classnames';
import { type ReactNode, useMemo, useState } from 'react';
import type { MultiValue } from 'react-select';
import Select from 'react-select';
import CreatableSelect from 'react-select/creatable';

import { useActivityQueue } from '../activityQueue.ts';
import { applySpec, populateTitle, runTask } from '../api.ts';
import { confirmDialog } from '../confirmDialog.ts';
import { type SchemaMap } from '../loadVibraryFile.ts';
import { promptDialog } from '../promptDialog.ts';
import { useSettings } from '../settingsContext.ts';
import { AGENTS, hashContent, type Spec } from '../vibraryXml.ts';

import { ApprovedBy } from './ApprovedBy.tsx';
import { ApproveIcon, ChevronIcon, ClickIcon, EditIcon, RemoveIcon, TypeIcon } from './Icons.tsx';
import { optionsToPrompt, schemaDefaults } from './taskOptions.ts';
import { TaskOptionsForm } from './TaskOptionsForm.tsx';

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
    schemas: SchemaMap;
    allTitles: string[];
    onChange: (next: Spec) => void;
    onToggleMode: () => void;
    onRemove: () => void;
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

const SpecCard = function ({ value, index, mode, highlighted = false, schemas, allTitles, onChange, onToggleMode, onRemove, selected, onToggleSelect }: SpecCardProperties) {
    const isEditing = mode === 'edit';
    const { enqueue } = useActivityQueue();
    const { loaded: settingsLoaded, getTaskOptions, setTaskOptions, resetTaskOptions } = useSettings();
    const [expanded, setExpanded] = useState(false);
    const [applying, setApplying] = useState(false);
    const [populating, setPopulating] = useState(false);
    const [useCustomInstructions, setUseCustomInstructions] = useState(false);

    // A task may declare a per-run options form via `formSchemaRef` ("<sibling-file>#<schemaId>"), resolved when the
    // file loads into the `schemas` map (keyed by that same ref). A missing/dangling ref simply means "no form". The
    // selected values are ephemeral (seeded from the schema defaults, sent only with the run), so they live in local
    // state and are never written back to the entry.
    const optionsSchema = useMemo<RJSFSchema | null>(function () {
        if (value.type !== 'task' || value.formSchemaRef === '') {
            return null;
        }
        return schemas[value.formSchemaRef] ?? null;
    }, [value.type, value.formSchemaRef, schemas]);
    // The task's options form is keyed by its stable formSchemaRef (entry ids are regenerated on every parse). The last
    // used values are remembered in the per-project settings and re-applied here; a "Reset to default options" button
    // drops them back to the schema defaults.
    const optionsReference = value.formSchemaRef;
    const [optionsData, setOptionsData] = useState<Record<string, unknown>>(function () {
        return optionsSchema ? schemaDefaults(optionsSchema) : {};
    });
    // Settings load asynchronously, so the initial state above is seeded from schema defaults. Once they arrive, apply
    // any remembered values by adjusting state during render (the React-recommended alternative to a setState effect),
    // guarded so it runs once and never clobbers edits the user already made this session (`optionsTouched`).
    const [optionsTouched, setOptionsTouched] = useState(false);
    const [optionsSeeded, setOptionsSeeded] = useState(false);
    if (!optionsSeeded && settingsLoaded && optionsSchema !== null && !optionsTouched) {
        setOptionsSeeded(true);
        const stored = getTaskOptions(optionsReference);
        if (stored !== null) {
            setOptionsData({ ...schemaDefaults(optionsSchema), ...stored });
        }
    }

    const handleOptionsChange = function (next: Record<string, unknown>) {
        setOptionsTouched(true);
        setOptionsData(next);
        setTaskOptions(optionsReference, next);
    };

    const handleResetOptions = function () {
        if (optionsSchema === null) {
            return;
        }
        setOptionsTouched(true);
        setOptionsData(schemaDefaults(optionsSchema));
        resetTaskOptions(optionsReference);
    };

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
            console.error(error);
        } finally {
            setPopulating(false);
        }
    };

    // The expanded view exposes one headless-agent action whose meaning depends on the entry type: a spec is "applied"
    // (the codebase is made to conform to it), a task is "run" (the work it describes is carried out). Both backend
    // calls share the same signature, so a single handler drives either; only spec and task entries show the action.
    const runAction = value.type === 'task' ?
        { label: 'Run this task', busyLabel: 'Running...', run: runTask } :
        { label: 'Apply this spec', busyLabel: 'Applying...', run: applySpec };
    const hasRunAction = value.type === 'spec' || value.type === 'task';

    // Queue the headless agent for this entry on the activity monitor (one job runs at a time). Uses the in-memory value
    // (current edits), so no save is needed first; the job's raw stdout is logged to the browser console for debugging.
    // When "Provide custom one time instructions" is ticked, prompt first and forward the entered text to this run;
    // cancelling (or leaving it blank) aborts queuing rather than proceeding without the instructions the user opted to
    // give. The card returns as soon as the job is enqueued - progress lives in the activity monitor.
    const handleApply = async function () {
        if (applying) {
            return;
        }
        let instructions = '';
        if (useCustomInstructions) {
            setApplying(true);
            const entered = await promptDialog({
                message: 'Custom one-time instructions for this run:',
                placeholder: 'e.g. focus on the backend only, skip tests',
                confirmLabel: runAction.label
            });
            setApplying(false);
            if (entered === null) {
                return;
            }
            instructions = entered;
        }
        const options = optionsSchema ? optionsToPrompt(optionsSchema, optionsData) : '';
        const runArguments = { title: value.title, content: value.content, notes: value.notes, instructions, options };
        // The concise bubble shown in the activity: the user-authored parts, minus the backend's boilerplate framing (the
        // exact prompt is available via the bubble's "Full" toggle).
        const promptParts = [value.content];
        if (options !== '') {
            promptParts.push('', 'Selected options:', options);
        }
        if (instructions !== '') {
            promptParts.push('', 'Instructions:', instructions);
        }
        // Enqueue and let the activity monitor own the run; await only to log the job's stdout when it eventually
        // finishes (the await does not block the UI - the card has already returned control to the user).
        try {
            const output = await enqueue({
                kind: value.type === 'task' ? 'run-task' : 'apply-spec',
                label: value.title,
                prompt: promptParts.join('\n'),
                run: function (signal, onEvent) {
                    return runAction.run(runArguments, { signal, onEvent });
                }
            });
            console.log(output);
        } catch (error) {
            console.error(error);
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

    // Three-way action on the human approval. Mirrors the "Approved" Yes/No control as a one-click action.
    // - stale: reapprove against the current content (no confirm - it only re-affirms a sign-off).
    // - approved and current: remove the approval, confirmed first since it undoes a deliberate sign-off.
    // - not approved: approve, storing the current content hash.
    const toggleApprove = async function () {
        if (isHumanApproved && !isHumanStale) {
            const confirmed = await confirmDialog(
                'Remove your approval from this spec?',
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

    // Confirm before deleting the whole spec - removal is destructive and not undoable.
    const confirmRemove = async function () {
        const confirmed = await confirmDialog(
            'Remove this spec?',
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
                    aria-label="Select entry"
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
                                    aria-label="Spec title"
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
                            <span className={styles.specCardTitle}>{value.title || `(untitled spec #${index + 1})`}</span>
                        )}
                </div>
                <div className={styles.specCardActions}>
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

            <div className={styles.specFields}>
                <div className={styles.specContent}>
                    {isEditing ?
                        (
                            <textarea
                                id={fieldId('content')}
                                aria-label="Spec content"
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
                            <Chips items={value.labels} />}
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

                    <Row label="Approved" inline>
                        <ApprovedBy
                            idPrefix={value.id}
                            value={value.approved}
                            contentHash={currentHash}
                            isEditing={isEditing}
                            onChange={function (next) {
                                update({ approved: next });
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

                    {hasRunAction &&
                    <div className={styles.applyRow}>
                        {optionsSchema &&
                        <div className={styles.optionsBlock}>
                            <button type="button" className={styles.resetOptions} onClick={handleResetOptions}>
                                Reset to default options
                            </button>
                            <TaskOptionsForm
                                schema={optionsSchema}
                                formData={optionsData}
                                onChange={handleOptionsChange}
                            />
                        </div>}
                        <button
                            type="button"
                            className={styles.apply}
                            disabled={applying}
                            onClick={handleApply}
                        >
                            {applying && <span className={styles.spinner} aria-hidden="true" />}
                            {applying ? runAction.busyLabel : runAction.label}
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
                    </div>}
                </div>}
            </div>
        </fieldset>
    );
};

export { SpecCard };
