// Runtime lives in the framework-free ./vibraryXmlCore.js so it can be reused outside the browser build (for example by
// scripts/canonicalize-vibrary.js under plain node). This file is the type layer: it declares Agent/Spec and re-exports
// the core with precise signatures so all consumers keep full type-checking.
import {
    AGENTS as AGENTSImpl,
    approvalState as approvalStateImpl,
    countApprovedSpecs as countApprovedSpecsImpl,
    emptySpec as emptySpecImpl,
    ENTRY_TYPE_BY_FAMILY as ENTRY_TYPE_BY_FAMILYImpl,
    ENTRY_TYPES as ENTRY_TYPESImpl,
    entryTypeFromName as entryTypeFromNameImpl,
    hashContent as hashContentImpl,
    parseVibraryXml as parseVibraryXmlImpl,
    serializeVibraryXml as serializeVibraryXmlImpl
} from './vibraryXmlCore.js';

type Agent = 'Human' | 'AI';

// A spec's sign-off state: never approved, approved on the current content, or approved on content that has since
// changed (stale).
type ApprovalState = 'none' | 'current' | 'stale';

// The kinds of entry the app understands, carried per <entry type>. A file is just a container and may hold any mix;
// only 'spec' and 'task' entries have a headless-agent run action ("Apply this spec" / "Run this task").
type EntryType = 'spec' | 'review' | 'task' | 'idea';

type Spec = {
    // Client-only stable identity for React keys; never serialized to XML
    id: string;
    // The entry's kind, written as the <entry type> attribute.
    type: EntryType;
    title: string;
    createdBy: Agent | '';
    // The short hash of <content> captured when a human approved the spec (see hashContent). Empty when not approved;
    // a stored hash that no longer matches the current content is a stale approval (the text changed since sign-off).
    approved: string;
    content: string;
    // Short hash of `content`, kept in sync whenever the content changes (see hashContent). Persisted as <contentHash>
    // and the value stored in `approved` when a human signs off.
    contentHash: string;
    relatesTo: string[];
    notes: string;
    // Optional reference to a per-run options form schema, as "<sibling-file>#<schemaId>" (e.g.
    // "tasks.xml.schemas.json#update-npm-packages-options"). The file is resolved against the entry file's directory and
    // the id looked up in it. Empty when the entry declares no form; only 'task' entries render it, as checkboxes above
    // the "Run this task" button.
    formSchemaRef: string;
    labels: string[];
    // ISO 8601 timestamps, managed automatically: `created` is stamped once at creation, `updated` on every edit.
    // Empty when unknown (for example a spec parsed from a file written before these fields existed).
    created: string;
    updated: string;
    // Who made the most recent edit, managed automatically like `updated`. Edits through the UI are always Human;
    // AI sets this itself when it edits the XML file directly. Empty when unknown.
    updatedBy: Agent | ''
};

// The JS core is untyped, so its inferred signatures are too wide (for example createdBy: string rather than '' | Agent).
// Pin each re-export to its precise type here - this file is the single place those types are declared.
const AGENTS = AGENTSImpl as Agent[];
const approvalState = approvalStateImpl as (spec: Spec) => ApprovalState;
const countApprovedSpecs = countApprovedSpecsImpl as (specs: Spec[]) => number;
const emptySpec = emptySpecImpl as (type?: EntryType) => Spec;
const ENTRY_TYPES = ENTRY_TYPESImpl as EntryType[];
const ENTRY_TYPE_BY_FAMILY = ENTRY_TYPE_BY_FAMILYImpl as Record<string, EntryType>;
const entryTypeFromName = entryTypeFromNameImpl as (name: string) => EntryType;
const hashContent = hashContentImpl as (spec: Spec) => string;
const parseVibraryXml = parseVibraryXmlImpl as (xml: string) => Spec[];
const serializeVibraryXml = serializeVibraryXmlImpl as (entries: Spec[]) => string;

export {
    type Agent,
    AGENTS,
    approvalState,
    type ApprovalState,
    countApprovedSpecs,
    emptySpec,
    ENTRY_TYPE_BY_FAMILY,
    ENTRY_TYPES,
    type EntryType,
    entryTypeFromName,
    hashContent,
    parseVibraryXml,
    serializeVibraryXml,
    type Spec
};

// Pure pass-throughs (no retyping needed), so re-export them straight from the core. randomId is the guarded id
// minter every call site must use instead of bare crypto.randomUUID, which is undefined over plain HTTP on a LAN
// address (the phone case).
export { nowTimestamp, randomId } from './vibraryXmlCore.js';
