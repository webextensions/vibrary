import { type ReactNode, useState } from 'react';
import type { MultiValue } from 'react-select';
import Select from 'react-select';
import CreatableSelect from 'react-select/creatable';

import { AGENTS, type Truth } from '../truthsXml.ts';

import { ApprovedBy } from './ApprovedBy.tsx';

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
        <div className={inline ? 'truth-row truth-row-inline' : 'truth-row'}>
            {htmlFor === undefined ?
                <span className="row-label">{label}</span> :
                <label className="row-label" htmlFor={htmlFor}>{label}</label>}
            <div className="row-content">{children}</div>
        </div>
    );
};

const Chips = function ({ items }: { items: string[] }) {
    if (items.length === 0) {
        return <span className="muted">-</span>;
    }
    return (
        <span className="chips">
            {items.map(function (item) {
                return <span key={item} className="chip">{item}</span>;
            })}
        </span>
    );
};

const TruthCard = function ({ value, index, mode, allTitles, onChange, onToggleMode, onRemove }: TruthCardProperties) {
    const isEditing = mode === 'edit';
    const [expanded, setExpanded] = useState(false);

    const update = function (patch: Partial<Truth>) {
        onChange({ ...value, ...patch });
    };

    const fieldId = function (name: string) {
        return `truth-${value.id}-${name}`;
    };

    const relatesToOptions = toOptions(allTitles.filter(function (title) {
        return title !== value.title;
    }));

    const humanApproved = value.approvedBy.includes('Human');

    // Toggle the current human's approval. Mirrors the "Approved by" Human checkbox, exposed as a one-click action.
    const toggleApprove = function () {
        const without = value.approvedBy.filter(function (agent) {
            return agent !== 'Human';
        });
        update({ approvedBy: humanApproved ? without : [...without, 'Human'] });
    };

    return (
        <fieldset className="truth-card">
            <div className="truth-card-head">
                <div className="truth-card-title-group">
                    <button
                        type="button"
                        className="expand-toggle"
                        aria-expanded={expanded}
                        aria-label={expanded ? 'Collapse extra fields' : 'Expand extra fields'}
                        onClick={function () {
                            setExpanded(function (open) {
                                return !open;
                            });
                        }}
                    >
                        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                            <path
                                d="M4 2l4 4-4 4"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                fill="none"
                            />
                        </svg>
                    </button>
                    {isEditing ?
                        (
                            <input
                                className="title-input"
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
                            <span className="truth-card-title">{value.title || `(untitled truth #${index + 1})`}</span>
                        )}
                </div>
                <div className="truth-card-actions">
                    <button type="button" className="remove" onClick={onRemove}>Remove</button>
                    <button type="button" className="edit" onClick={onToggleMode}>{isEditing ? 'Done' : 'Edit'}</button>
                    <button
                        type="button"
                        className={humanApproved ? 'approve approved' : 'approve'}
                        onClick={toggleApprove}
                    >
                        {humanApproved ? 'Approved' : 'Approve'}
                    </button>
                </div>
            </div>

            <div className="truth-fields">
                <div className="truth-contents">
                    {isEditing ?
                        (
                            <textarea
                                aria-label="Truth contents"
                                value={value.contents}
                                spellCheck={false}
                                onChange={function (changeEvent) {
                                    update({ contents: changeEvent.target.value });
                                }}
                            />
                        ) :
                        <span className="multiline">{orDash(value.contents)}</span>}
                </div>

                {expanded &&
                <div className="truth-more">
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
                            <span className="multiline">{orDash(value.notes)}</span>}
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
                                <div className="radio-group">
                                    {AGENTS.map(function (agent) {
                                        const radioId = fieldId(`created-by-${agent}`);
                                        return (
                                            <label key={agent} className="radio" htmlFor={radioId}>
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
                            value={value.approvedBy}
                            onChange={function (next) {
                                update({ approvedBy: next });
                            }}
                        />
                    </Row>

                    <Row label="Created" inline>
                        <span className="muted" title={value.created}>{formatTimestamp(value.created)}</span>
                    </Row>

                    <Row label="Updated" inline>
                        <span className="muted" title={value.lastUpdated}>{formatTimestamp(value.lastUpdated)}</span>
                    </Row>

                    <Row label="Updated by" inline>
                        <span className="muted">{orDash(value.updatedBy)}</span>
                    </Row>
                </div>}
            </div>
        </fieldset>
    );
};

export { TruthCard };
