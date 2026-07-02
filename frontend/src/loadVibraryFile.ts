import type { RJSFSchema } from '@rjsf/utils';

import { getFile, getSchemaFile } from './api.ts';
import { parseVibraryXml, type Spec } from './vibraryXml.ts';

// Resolved per-run option form schemas for one open file, keyed by the entry's full formSchemaRef ("<file>#<id>"), so a
// SpecCard looks its schema up directly by value.formSchemaRef. Empty for files whose entries declare no form.
type SchemaMap = Record<string, RJSFSchema>;

// Split a "<file>#<id>" reference into its parts. Returns null when either side is missing, so a malformed ref resolves
// to no form rather than fetching a bogus path.
const parseSchemaReference = function (reference: string): { file: string; id: string } | null {
    const hash = reference.indexOf('#');
    if (hash === -1) {
        return null;
    }
    const file = reference.slice(0, hash);
    const id = reference.slice(hash + 1);
    if (file === '' || id === '') {
        return null;
    }
    return { file, id };
};

// The directory portion of a file path ('' for a top-level file), used to resolve a sibling schemas file against the
// entry file's own location.
const directoryOf = function (filePath: string): string {
    const slash = filePath.lastIndexOf('/');
    return slash === -1 ? '' : filePath.slice(0, slash);
};

// Fetch and index every schemas sidecar referenced by the entries of one file. Distinct sidecar files are fetched once
// each; for every id in a sidecar, the schema is registered under "<file>#<id>". The top-level $id is dropped before
// storing - here it is only decorative (lookup is by the ref string), and leaving it in risks ajv "schema already
// exists" when rjsf compiles repeated forms. Tolerant by design: a missing or invalid sidecar contributes nothing
// rather than failing the whole file load.
const loadSchemasForEntries = async function (filePath: string, specs: Spec[]): Promise<SchemaMap> {
    const directory = directoryOf(filePath);
    const files = new Set<string>();
    for (const spec of specs) {
        const parsed = spec.formSchemaRef === '' ? null : parseSchemaReference(spec.formSchemaRef);
        if (parsed === null) {
            continue;
        }
        files.add(parsed.file);
    }

    const map: SchemaMap = {};
    await Promise.all([...files].map(async function (file) {
        const sidecarPath = directory === '' ? file : `${directory}/${file}`;
        try {
            const document = JSON.parse(await getSchemaFile(sidecarPath)) as Record<string, RJSFSchema>;
            if (document === null || typeof document !== 'object') {
                return;
            }
            for (const [id, schema] of Object.entries(document)) {
                if (schema === null || typeof schema !== 'object') {
                    continue;
                }
                const { $id, ...rest } = schema as RJSFSchema & { $id?: unknown };
                void $id;
                map[`${file}#${id}`] = rest;
            }
        } catch {
            // Missing or unparseable sidecar: leave its referenced forms unresolved (the card shows no form).
        }
    }));
    return map;
};

// Load one vibrary file: its raw content, the parsed entries, and the resolved schema map for any formSchemaRefs. Only
// parseVibraryXml can throw (malformed XML, surfaced by callers as a parse error); schema resolution never throws.
const loadVibraryFile = async function (filePath: string): Promise<{ content: string; specs: Spec[]; schemas: SchemaMap }> {
    const content = await getFile(filePath);
    const specs = parseVibraryXml(content);
    const schemas = await loadSchemasForEntries(filePath, specs);
    return { content, specs, schemas };
};

export { loadVibraryFile, type SchemaMap };
