import { type ReactNode } from 'react';

import { splitByMatches } from './splitByMatches.ts';

// Wrap each case-insensitive occurrence of `query` in `text` with a <mark> carrying `markClassName`, leaving the rest
// as plain text. Shared by the Search panel (snippet emphasis) and the editor (marking a jumped-to entry's matching
// content/notes) so both mark identically. The matching itself lives in splitByMatches.ts (node-testable); this is
// the thin JSX mapping over its segments.
const highlightText = function (text: string, query: string, markClassName: string): ReactNode {
    return splitByMatches(text, query).map(function (segment, index) {
        // Index keys are fine: the segment list is derived fresh per render, never reordered or edited.
        // eslint-disable-next-line @eslint-react/no-array-index-key
        return segment.isMatch ? <mark key={index} className={markClassName}>{segment.text}</mark> : segment.text;
    });
};

export { highlightText };
