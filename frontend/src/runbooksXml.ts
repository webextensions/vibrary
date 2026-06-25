// Runtime lives in the framework-free ./runbooksXmlCore.js so it can be reused outside the browser build (for example by
// scripts/canonicalize-runbooks.js under plain node). This file is the type layer: it declares Agent/Truth and re-exports
// the core with precise signatures so all consumers keep full type-checking.
import {
    AGENTS as AGENTSImpl,
    approvalState as approvalStateImpl,
    countApprovedTruths as countApprovedTruthsImpl,
    emptyTruth as emptyTruthImpl,
    ENTRY_TYPE_BY_FAMILY as ENTRY_TYPE_BY_FAMILYImpl,
    ENTRY_TYPES as ENTRY_TYPESImpl,
    entryTypeFromName as entryTypeFromNameImpl,
    hashContent as hashContentImpl,
    parseRunbooksXml as parseRunbooksXmlImpl,
    serializeRunbooksXml as serializeRunbooksXmlImpl
} from './runbooksXmlCore.js';

type Agent = 'Human' | 'AI';

// A truth's sign-off state: never approved, approved on the current content, or approved on content that has since
// changed (stale).
type ApprovalState = 'none' | 'current' | 'stale';

// The kinds of entry the app understands, carried per <entry type>. A file is just a container and may hold any mix;
// only a 'truth' entry shows the "Apply this truth" action.
type EntryType = 'truth' | 'review' | 'spec' | 'task' | 'idea';

type Truth = {
    // Client-only stable identity for React keys; never serialized to XML
    id: string;
    // The entry's kind, written as the <entry type> attribute.
    type: EntryType;
    title: string;
    createdBy: Agent | '';
    // The short hash of <content> captured when a human approved the truth (see hashContent). Empty when not approved;
    // a stored hash that no longer matches the current content is a stale approval (the text changed since sign-off).
    approved: string;
    content: string;
    // Short hash of `content`, kept in sync whenever the content changes (see hashContent). Persisted as <contentHash>
    // and the value stored in `approved` when a human signs off.
    contentHash: string;
    relatesTo: string[];
    notes: string;
    labels: string[];
    // ISO 8601 timestamps, managed automatically: `created` is stamped once at creation, `updated` on every edit.
    // Empty when unknown (for example a truth parsed from a file written before these fields existed).
    created: string;
    updated: string;
    // Who made the most recent edit, managed automatically like `updated`. Edits through the UI are always Human;
    // AI sets this itself when it edits the XML file directly. Empty when unknown.
    updatedBy: Agent | ''
};

// The JS core is untyped, so its inferred signatures are too wide (for example createdBy: string rather than '' | Agent).
// Pin each re-export to its precise type here - this file is the single place those types are declared.
const AGENTS = AGENTSImpl as Agent[];
const approvalState = approvalStateImpl as (truth: Truth) => ApprovalState;
const countApprovedTruths = countApprovedTruthsImpl as (truths: Truth[]) => number;
const emptyTruth = emptyTruthImpl as (type?: EntryType) => Truth;
const ENTRY_TYPES = ENTRY_TYPESImpl as EntryType[];
const ENTRY_TYPE_BY_FAMILY = ENTRY_TYPE_BY_FAMILYImpl as Record<string, EntryType>;
const entryTypeFromName = entryTypeFromNameImpl as (name: string) => EntryType;
const hashContent = hashContentImpl as (truth: Truth) => string;
const parseRunbooksXml = parseRunbooksXmlImpl as (xml: string) => Truth[];
const serializeRunbooksXml = serializeRunbooksXmlImpl as (entries: Truth[]) => string;

export {
    type Agent,
    AGENTS,
    approvalState,
    type ApprovalState,
    countApprovedTruths,
    emptyTruth,
    ENTRY_TYPE_BY_FAMILY,
    ENTRY_TYPES,
    type EntryType,
    entryTypeFromName,
    hashContent,
    parseRunbooksXml,
    serializeRunbooksXml,
    type Truth
};

// Pure pass-through (no retyping needed), so re-export it straight from the core.
export { nowTimestamp } from './runbooksXmlCore.js';
