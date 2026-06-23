import { XMLBuilder, XMLParser, XMLValidator } from 'fast-xml-parser';

type Agent = 'Human' | 'AI';

const AGENTS: Agent[] = ['AI', 'Human'];

type Truth = {
    // Client-only stable identity for React keys; never serialized to XML
    id: string;
    title: string;
    createdBy: Agent | '';
    approvedBy: Agent[];
    contents: string;
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

const ARRAY_TAGS = new Set(['truth', 'by', 'ref', 'label']);

const parser = new XMLParser({
    ignoreAttributes: true,
    parseTagValue: false,
    trimValues: true,
    isArray: function (tagName) {
        return ARRAY_TAGS.has(tagName);
    }
});

const builder = new XMLBuilder({
    format: true,
    indentBy: ' '.repeat(4),
    ignoreAttributes: true,
    suppressEmptyNode: false,
    processEntities: true
});

const toText = function (value: unknown): string {
    if (value === undefined || value === null) {
        return '';
    }
    return String(value);
};

// fast-xml-parser yields an array for ARRAY_TAGS children when present, undefined when absent
const toList = function (node: unknown, key: string): string[] {
    if (!node || typeof node !== 'object') {
        return [];
    }
    const value = (node as Record<string, unknown>)[key];
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map(function (entry) {
            return toText(entry);
        })
        .filter(function (entry) {
            return entry !== '';
        });
};

const toAgent = function (value: unknown): Agent | '' {
    const text = toText(value);
    return (AGENTS as string[]).includes(text) ? (text as Agent) : '';
};

// crypto.randomUUID is only exposed in secure contexts (https or localhost); when the UI is opened over plain HTTP on a
// LAN address (for example from a phone), it is undefined. These ids are client-only React keys that are never
// serialized, so fall back to a non-cryptographic unique-enough id rather than letting the parse throw.
const randomId = function (): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `truth-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

const nowTimestamp = function (): string {
    return new Date().toISOString();
};

const emptyTruth = function (): Truth {
    const now = nowTimestamp();
    return {
        id: randomId(),
        title: '',
        createdBy: '',
        approvedBy: [],
        contents: '',
        relatesTo: [],
        notes: '',
        labels: [],
        created: now,
        lastUpdated: now,
        updatedBy: 'Human' // a new truth is always added through the human-operated UI
    };
};

const parseTruthsXml = function (xml: string): Truth[] {
    if (xml.trim() === '') {
        return [];
    }

    const validation = XMLValidator.validate(xml);
    if (validation !== true) {
        throw new Error(validation.err.msg);
    }

    const document = parser.parse(xml) as Record<string, unknown>;
    const root = (document.root ?? {}) as Record<string, unknown>;
    const truthsNode = (root.truths ?? {}) as Record<string, unknown>;
    const rawTruths = Array.isArray(truthsNode.truth) ? truthsNode.truth : [];

    return rawTruths.map(function (raw: Record<string, unknown>) {
        return {
            id: randomId(),
            title: toText(raw.title),
            createdBy: toAgent(raw.createdBy),
            approvedBy: toList(raw.approvedBy, 'by').filter(function (entry): entry is Agent {
                return (AGENTS as string[]).includes(entry);
            }),
            contents: toText(raw.contents),
            relatesTo: toList(raw.relatesTo, 'ref'),
            notes: toText(raw.notes),
            labels: toList(raw.labels, 'label'),
            created: toText(raw.created),
            lastUpdated: toText(raw.lastUpdated),
            updatedBy: toAgent(raw.updatedBy)
        };
    });
};

const serializeTruthsXml = function (truths: Truth[]): string {
    const document = {
        root: {
            truths: {
                truth: truths.map(function (truth) {
                    return {
                        title: truth.title,
                        createdBy: truth.createdBy,
                        approvedBy: { by: truth.approvedBy },
                        contents: truth.contents,
                        relatesTo: { ref: truth.relatesTo },
                        notes: truth.notes,
                        labels: { label: truth.labels },
                        created: truth.created,
                        lastUpdated: truth.lastUpdated,
                        updatedBy: truth.updatedBy
                    };
                })
            }
        }
    };

    return `${(builder.build(document) as string).trimEnd()}\n`;
};

export { type Agent, AGENTS, emptyTruth, nowTimestamp, parseTruthsXml, serializeTruthsXml, type Truth };
