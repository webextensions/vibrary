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

// Turn the selected values into a readable directive block for the agent prompt, one line per property keyed by its
// human-facing `title` (falling back to the property name). Booleans render as yes/no; anything else prints its value.
// Returns '' when the schema has no properties, so the caller can omit the block entirely.
const optionsToPrompt = function (schema: RJSFSchema, formData: FormData): string {
    const properties = (schema.properties ?? {}) as Record<string, RJSFSchema>;
    const lines = Object.entries(properties).map(function ([key, property]) {
        const label = typeof property.title === 'string' ? property.title : key;
        const value = formData[key];
        const rendered = typeof value === 'boolean' ? (value ? 'yes' : 'no') : String(value);
        return `- ${label}: ${rendered}`;
    });
    return lines.join('\n');
};

export { type FormData, optionsToPrompt, schemaDefaults };
