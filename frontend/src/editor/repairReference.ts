import { normalizeTitle } from '../xml/vibraryXml.ts';

// Candidate repairs for a dangling relatesTo reference, best first. A dangling reference is a statement of intent
// that lost its target (a rename, a typo, an agent-written ref nothing validated) - and for every cause except a real
// deletion the intended target is recoverable by string matching, because titles are short canonical identifiers
// (lowercase, hyphenated - the one normalizeTitle rule). Three tiers, cheapest first:
//   - equal after normalization (catches a hand-written "Auth Token Refresh" vs "auth-token-refresh"),
//   - bounded edit distance (catches "oauth-token-refesh"),
//   - prefix/substring containment (catches "oauth-token" -> "oauth-token-refresh").
// Deliberately NO agent and no similarity library: unlike entry CONTENT (where string similarity is the wrong tool),
// short identifiers are exactly what edit distance is for. Callers must only ever PROPOSE the best candidate - a
// confidently-wrong automatic repair is worse than a dangling reference, because a broken link announces itself and a
// wrong link does not.

// Two edits covers the realistic typo space for hyphenated identifiers without letting unrelated titles through.
const EDIT_DISTANCE_LIMIT = 2;

// Containment only counts when the contained string is a meaningful fragment - single characters and tiny stems would
// otherwise "match" half the folder.
const MIN_CONTAINMENT_LENGTH = 4;

// Levenshtein distance, abandoned (null) as soon as it provably exceeds `limit`. Hand-rolled deliberately: the
// standard library has no edit distance, and a dependency is not warranted for a bounded loop over identifiers this
// short (the classic two-row DP with an early exit on the row minimum).
const boundedEditDistance = function (a: string, b: string, limit: number): number | null {
    if (Math.abs(a.length - b.length) > limit) {
        return null;
    }
    let previousRow = Array.from({ length: b.length + 1 }, function (_, index) { return index; });
    for (let rowIndex = 1; rowIndex <= a.length; rowIndex += 1) {
        const currentRow = [rowIndex];
        let rowMinimum = rowIndex;
        for (let columnIndex = 1; columnIndex <= b.length; columnIndex += 1) {
            const substitution = previousRow[columnIndex - 1] + (a[rowIndex - 1] === b[columnIndex - 1] ? 0 : 1);
            const value = Math.min(previousRow[columnIndex] + 1, currentRow[columnIndex - 1] + 1, substitution);
            currentRow.push(value);
            rowMinimum = Math.min(rowMinimum, value);
        }
        if (rowMinimum > limit) {
            return null;
        }
        previousRow = currentRow;
    }
    return previousRow[b.length] <= limit ? previousRow[b.length] : null;
};

const repairCandidates = function (dangling: string, titles: string[]): string[] {
    const normalized = normalizeTitle(dangling);
    const exact: string[] = [];
    const near: { title: string; distance: number }[] = [];
    const partial: string[] = [];
    for (const title of titles) {
        if (title === '' || title === dangling) {
            continue;
        }
        if (title === normalized) {
            exact.push(title);
            continue;
        }
        const distance = boundedEditDistance(normalized, title, EDIT_DISTANCE_LIMIT);
        if (distance !== null) {
            near.push({ title, distance });
            continue;
        }
        const shorter = normalized.length < title.length ? normalized : title;
        if (shorter.length >= MIN_CONTAINMENT_LENGTH && (title.includes(normalized) || normalized.includes(title))) {
            partial.push(title);
        }
    }
    near.sort(function (a, b) {
        return a.distance - b.distance || a.title.localeCompare(b.title);
    });
    partial.sort(function (a, b) {
        return a.localeCompare(b);
    });
    const ordered = [...exact, ...near.map(function (candidate) { return candidate.title; }), ...partial];
    return [...new Set(ordered)];
};

export { repairCandidates };
