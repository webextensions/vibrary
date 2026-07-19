// Splits a raw search query into its free-text needle and its field constraints. A token of the form `field:value`
// (optionally `-field:value` to negate) is a constraint when `field` is one we know; anything else - including a
// colon inside ordinary prose ("note: check this") and an unknown field ("typo:spec") - stays part of the needle, so
// a user who has never heard of operators is never surprised by one. Values keep everything after the FIRST colon
// ("label:has:colon" constrains on "has:colon") and are kept RAW here - each consumer case-folds per field, because
// `file:` values are gitignore-style globs where case matters while type/label/approved/by comparisons do not.
//
// Shared (and listed in package.json "files") because both stacks need the same split: the backend evaluates the
// constraints, and the Search panel must parse identically to know that a constraint-only query is valid with an
// empty needle - two parsers would drift on exactly the tokens users type.
const KNOWN_FIELDS = new Set(['type', 'label', 'approved', 'by', 'file', 'in']);

const parseSearchQuery = function (raw) {
    const constraints = [];
    const words = [];
    for (const token of String(raw).split(/\s+/u)) {
        if (token === '') {
            continue;
        }
        const negated = token.startsWith('-');
        const body = negated ? token.slice(1) : token;
        const at = body.indexOf(':');
        const field = at === -1 ? '' : body.slice(0, at).toLowerCase();
        const value = at === -1 ? '' : body.slice(at + 1);
        if (at !== -1 && value !== '' && KNOWN_FIELDS.has(field)) {
            constraints.push({ field, value, negated });
        } else {
            words.push(token);
        }
    }
    return { needle: words.join(' ').trim(), constraints };
};

export { parseSearchQuery };
