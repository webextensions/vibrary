import { XMLBuilder, XMLParser, XMLValidator } from 'fast-xml-parser';

const AGENTS = ['AI', 'Human'];

// The kinds of entry the app understands, carried per <entry type> (singular). A file is just a container and may hold
// any mix of these; 'spec' is the default for an entry with no type attribute.
const ENTRY_TYPES = ['spec', 'review', 'task', 'idea'];

// Maps a file-name family (plural) to its entry type (singular). Used for the "Create with AI" dropdown labels and to
// seed that dialog's default from the open file's name - the name is only a hint, never a constraint on content.
const ENTRY_TYPE_BY_FAMILY = {
    specs: 'spec',
    reviews: 'review',
    tasks: 'task',
    ideas: 'idea'
};

// Derive a default entry type from a file's basename prefix (reviews-foo.xml -> 'review'). Defaults to 'spec'.
const entryTypeFromName = function (name) {
    const base = String(name).split('/').at(-1) ?? '';
    const family = base.split(/[-.]/, 1)[0];
    return ENTRY_TYPE_BY_FAMILY[family] ?? 'spec';
};

const ARRAY_TAGS = new Set(['entry', 'ref', 'label']);

const parser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    trimValues: true,
    isArray: function (tagName) {
        return ARRAY_TAGS.has(tagName);
    }
});

const builder = new XMLBuilder({
    format: true,
    indentBy: ' '.repeat(4),
    ignoreAttributes: false,
    suppressEmptyNode: false,
    processEntities: true
});

const toText = function (value) {
    if (value === undefined || value === null) {
        return '';
    }
    return String(value);
};

// fast-xml-parser yields an array for ARRAY_TAGS children when present, undefined when absent
const toList = function (node, key) {
    if (!node || typeof node !== 'object') {
        return [];
    }
    const value = node[key];
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

const toAgent = function (value) {
    const text = toText(value);
    return AGENTS.includes(text) ? text : '';
};

// Short hash of a spec's <content>. It is persisted as <contentHash> (kept in sync whenever the content changes) and
// captured inside <approved> at approval time, so the UI can tell when the text has changed since sign-off (stale
// approval). A pure-JS hash is used on purpose: it is only a content-change detector,
// not a security primitive, and the standard options do not fit here - crypto.subtle.digest is async and, like
// crypto.randomUUID above, is unavailable over plain HTTP on a LAN address (the phone case), while Node's
// crypto.createHash is not in the browser. cyrb53 is deterministic and identical in the browser and under node, so the
// app, scripts, and migration all agree. Rendered as zero-padded hex (~13 chars).
// cyrb53's mixing step is inherently bitwise, and charCodeAt (not codePointAt) is load-bearing: switching to
// codePointAt would change the hash for any content containing astral characters (surrogate pairs), silently
// invalidating every previously-stored <contentHash>/<approved> value for such content. Disabled for this function
// only, not project-wide.
/* eslint-disable no-bitwise, @stylistic/no-mixed-operators, unicorn/prefer-code-point */
const hashContent = function (spec) {
    // Hash the same normalization of the content that survives a save/load round trip: the parser is configured with
    // trimValues (edge whitespace is dropped) and XML text nodes normalize CRLF to LF, so hashing the raw textarea
    // value would make an approval captured against "text\n" go stale on the very next reload. For content without
    // edge whitespace or CRLF this is the identity, so existing stored hashes are unaffected.
    const text = toText(spec.content).replaceAll('\r\n', '\n').trim();
    let h1 = 0xDEADBEEF;
    let h2 = 0x41C6CE57;
    for (let index = 0; index < text.length; index += 1) {
        const code = text.charCodeAt(index);
        h1 = Math.imul(h1 ^ code, 2654435761);
        h2 = Math.imul(h2 ^ code, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    const value = 4294967296 * (2097151 & h2) + (h1 >>> 0);
    return value.toString(16).padStart(13, '0');
};
/* eslint-enable no-bitwise, @stylistic/no-mixed-operators, unicorn/prefer-code-point */

// crypto.randomUUID is only exposed in secure contexts (https or localhost); when the UI is opened over plain HTTP on a
// LAN address (for example from a phone), it is undefined. These ids are client-only identity keys (entry ids, job ids,
// chat-message ids) that are never serialized, so fall back to a non-cryptographic unique-enough id rather than
// throwing. Exported so every id-minting call site shares this guard instead of calling crypto.randomUUID bare.
const randomId = function () {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `spec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

const nowTimestamp = function () {
    return new Date().toISOString();
};

const toEntryType = function (value) {
    const text = toText(value);
    return ENTRY_TYPES.includes(text) ? text : 'spec';
};

const emptySpec = function (type = 'spec') {
    const now = nowTimestamp();
    return {
        id: randomId(),
        type: toEntryType(type),
        title: '',
        createdBy: '',
        approved: '',
        content: '',
        contentHash: hashContent({ content: '' }),
        relatesTo: [],
        notes: '',
        formSchemaRef: '',
        labels: [],
        created: now,
        updated: now,
        updatedBy: 'Human' // a new spec is always added through the human-operated UI
    };
};

// Parse a vibrary XML document into a list of entry models. A file is just a container of <entry> elements, each
// carrying its own type attribute (spec/review/task/idea, default 'spec'). Returns [] for an empty/new file.
const parseVibraryXml = function (xml) {
    if (xml.trim() === '') {
        return [];
    }

    const validation = XMLValidator.validate(xml);
    if (validation !== true) {
        throw new Error(validation.err.msg);
    }

    const document = parser.parse(xml);
    const root = document.root ?? {};
    const entriesNode = root.entries ?? {};
    const rawEntries = Array.isArray(entriesNode.entry) ? entriesNode.entry : [];

    return rawEntries.map(function (raw) {
        const content = toText(raw.content);
        return {
            id: randomId(),
            type: toEntryType(raw['@_type']),
            title: toText(raw.title),
            createdBy: toAgent(raw.createdBy),
            approved: toText(raw.approved),
            content: content,
            // Recomputed from content, not read from <contentHash>, so it always reflects the actual text even if the
            // stored value was hand-edited out of sync.
            contentHash: hashContent({ content: content }),
            relatesTo: toList(raw.relatesTo, 'ref'),
            notes: toText(raw.notes),
            formSchemaRef: toText(raw.formSchemaRef),
            labels: toList(raw.labels, 'label'),
            created: toText(raw.created),
            updated: toText(raw.updated),
            updatedBy: toAgent(raw.updatedBy)
        };
    });
};

// A spec's approval state: 'none' (never signed off), 'current' (signed off on the present content), or 'stale'
// (signed off, but the content changed since - the stored hash no longer matches). Pure, so it is shared by the UI's
// status filter and any other consumer.
const approvalState = function (spec) {
    if (spec.approved === '') {
        return 'none';
    }
    return spec.approved === hashContent(spec) ? 'current' : 'stale';
};

// A spec counts as approved once a human has signed off on its current content. An approval whose stored hash no
// longer matches the content is stale (the text changed since sign-off) and does not count.
const countApprovedSpecs = function (specs) {
    return specs.filter(function (spec) {
        return spec.approved === hashContent(spec);
    }).length;
};

// Serialize a list of entries back to a vibrary XML document. Each entry carries its own type attribute
// (spec/review/task/idea, default 'spec'); the file itself has no type.
const serializeVibraryXml = function (entries) {
    const document = {
        root: {
            entries: {
                entry: entries.map(function (spec) {
                    return {
                        '@_type': toEntryType(spec.type),
                        'title': spec.title,
                        'createdBy': spec.createdBy,
                        'approved': spec.approved,
                        'content': spec.content,
                        'contentHash': spec.contentHash,
                        'relatesTo': { ref: spec.relatesTo },
                        'notes': spec.notes,
                        'formSchemaRef': spec.formSchemaRef,
                        'labels': { label: spec.labels },
                        'created': spec.created,
                        'updated': spec.updated,
                        'updatedBy': spec.updatedBy
                    };
                })
            }
        }
    };

    return `${builder.build(document).trimEnd()}\n`;
};

export {
    AGENTS,
    approvalState,
    countApprovedSpecs,
    emptySpec,
    ENTRY_TYPE_BY_FAMILY,
    ENTRY_TYPES,
    entryTypeFromName,
    hashContent,
    nowTimestamp,
    parseVibraryXml,
    randomId,
    serializeVibraryXml
};
