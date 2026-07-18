// The matching half of highlightText, kept JSX-free so it runs under node --test (the test glob covers *.test.ts
// only, and JSX is not stripped by Node's type stripping). Splits `text` into ordered segments, marking each
// case-insensitive occurrence of `query`; matching on a lowercased copy while slicing the original keeps the
// output's casing.
type MatchSegment = { text: string; isMatch: boolean };

const splitByMatches = function (text: string, query: string): MatchSegment[] {
    const haystack = text.toLowerCase();
    const needle = query.toLowerCase();
    // An empty needle makes indexOf return 0 forever - an infinite loop that hangs the tab. Callers gate on a query
    // length floor, but that invariant lives far from this loop, so guard it here rather than trust every caller.
    if (needle === '') {
        return [{ text, isMatch: false }];
    }
    const segments: MatchSegment[] = [];
    let cursor = 0;
    let found = haystack.indexOf(needle, cursor);
    while (found !== -1) {
        if (found > cursor) {
            segments.push({ text: text.slice(cursor, found), isMatch: false });
        }
        segments.push({ text: text.slice(found, found + needle.length), isMatch: true });
        cursor = found + needle.length;
        found = haystack.indexOf(needle, cursor);
    }
    if (cursor < text.length) {
        segments.push({ text: text.slice(cursor), isMatch: false });
    }
    return segments;
};

export { type MatchSegment, splitByMatches };
