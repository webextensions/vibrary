import { type ReactNode } from 'react';

// Wrap each case-insensitive occurrence of `query` in `text` with a <mark> carrying `markClassName`, leaving the rest as
// plain text. Matching on a lowercased copy while slicing the original keeps the output's casing. Shared by the Search
// panel (snippet emphasis) and the editor (marking a jumped-to entry's matching content/notes) so both mark identically.
const highlightText = function (text: string, query: string, markClassName: string): ReactNode {
    const haystack = text.toLowerCase();
    const needle = query.toLowerCase();
    // An empty needle makes indexOf return 0 forever - an infinite loop that hangs the tab. Callers gate on a query
    // length floor, but that invariant lives far from this loop, so guard it here rather than trust every caller.
    if (needle === '') {
        return text;
    }
    const parts: ReactNode[] = [];
    let cursor = 0;
    let found = haystack.indexOf(needle, cursor);
    let key = 0;
    while (found !== -1) {
        if (found > cursor) {
            parts.push(text.slice(cursor, found));
        }
        parts.push(<mark key={key} className={markClassName}>{text.slice(found, found + needle.length)}</mark>);
        key += 1;
        cursor = found + needle.length;
        found = haystack.indexOf(needle, cursor);
    }
    if (cursor < text.length) {
        parts.push(text.slice(cursor));
    }
    return parts;
};

export { highlightText };
