import type { RJSFSchema } from '@rjsf/utils';

type FormData = Record<string, unknown>;

// Read every property's `default` out of a JSON Schema so the card can seed the ephemeral formData before the user
// touches anything (rjsf would otherwise leave unset booleans undefined until first interaction).
const schemaDefaults = function (schema: RJSFSchema): FormData {
    const properties = (schema.properties ?? {}) as Record<string, RJSFSchema>;
    const defaults: FormData = {};
    for (const [key, property] of Object.entries(properties)) {
        if (property.default !== undefined) {
            defaults[key] = property.default;
        }
    }
    return defaults;
};

// Whether rjsf's "cleared" representation for a field counts as empty: undefined for most widget types, but an empty
// array for a multi-select/checkboxes field and an empty string for a text field - rjsf never reports either of those
// as undefined, so a plain `?? property.default` fallback (as this function used to do) misses them.
const isEmptyValue = function (value: unknown): boolean {
    return value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
};

// Turn the selected values into a readable directive block for the agent prompt, one line per property keyed by its
// human-facing `title` (falling back to the property name). Booleans render as yes/no; arrays join with ", "; anything
// else prints its value. A value the user cleared falls back to the property's schema default, and its line is dropped
// entirely when the (possibly defaulted) value is still empty, so the block never contains a dangling "- Label: " line.
// Returns '' when nothing renders, so the caller can omit the block entirely.
const optionsToPrompt = function (schema: RJSFSchema, formData: FormData): string {
    const properties = (schema.properties ?? {}) as Record<string, RJSFSchema>;
    const lines = Object.entries(properties).flatMap(function ([key, property]) {
        const label = typeof property.title === 'string' ? property.title : key;
        const rawValue = formData[key];
        const value = isEmptyValue(rawValue) ? property.default : rawValue;
        if (value === undefined || isEmptyValue(value)) {
            return [];
        }
        const rendered = typeof value === 'boolean' ?
            (value ? 'yes' : 'no') :
            (Array.isArray(value) ? value.join(', ') : String(value));
        return [`- ${label}: ${rendered}`];
    });
    return lines.join('\n');
};

export { type FormData, optionsToPrompt, schemaDefaults };
