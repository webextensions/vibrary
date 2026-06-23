// Runtime lives in the framework-free ./truthsXmlCore.js so it can be reused outside the browser build (for example by
// scripts/canonicalize-truths.js under plain node). This file is the type layer: it declares Agent/Truth and re-exports
// the core with precise signatures so all consumers keep full type-checking.
import {
    AGENTS as AGENTSImpl,
    approvalState as approvalStateImpl,
    countApprovedTruths as countApprovedTruthsImpl,
    emptyTruth as emptyTruthImpl,
    hashContent as hashContentImpl,
    parseTruthsXml as parseTruthsXmlImpl,
    serializeTruthsXml as serializeTruthsXmlImpl
} from './truthsXmlCore.js';

type Agent = 'Human' | 'AI';

// A truth's sign-off state: never approved, approved on the current content, or approved on content that has since
// changed (stale).
type ApprovalState = 'none' | 'current' | 'stale';

type Truth = {
    // Client-only stable identity for React keys; never serialized to XML
    id: string;
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
    // ISO 8601 timestamps, managed automatically: `created` is stamped once at creation, `lastUpdated` on every edit.
    // Empty when unknown (for example a truth parsed from a file written before these fields existed).
    created: string;
    lastUpdated: string;
    // Who made the most recent edit, managed automatically like `lastUpdated`. Edits through the UI are always Human;
    // AI sets this itself when it edits the XML file directly. Empty when unknown.
    updatedBy: Agent | ''
};

// The JS core is untyped, so its inferred signatures are too wide (for example createdBy: string rather than '' | Agent).
// Pin each re-export to its precise type here - this file is the single place those types are declared.
const AGENTS = AGENTSImpl as Agent[];
const approvalState = approvalStateImpl as (truth: Truth) => ApprovalState;
const countApprovedTruths = countApprovedTruthsImpl as (truths: Truth[]) => number;
const emptyTruth = emptyTruthImpl as () => Truth;
const hashContent = hashContentImpl as (truth: Truth) => string;
const parseTruthsXml = parseTruthsXmlImpl as (xml: string) => Truth[];
const serializeTruthsXml = serializeTruthsXmlImpl as (truths: Truth[]) => string;

export {
    type Agent,
    AGENTS,
    approvalState,
    type ApprovalState,
    countApprovedTruths,
    emptyTruth,
    hashContent,
    parseTruthsXml,
    serializeTruthsXml,
    type Truth
};

// Pure pass-through (no retyping needed), so re-export it straight from the core.
export { nowTimestamp } from './truthsXmlCore.js';
