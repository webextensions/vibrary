import { type Spec } from '../xml/vibraryXml.ts';

// Render one entry as readable Markdown for pasting into a PR description, doc, or chat. The title becomes a heading
// (falling back to the same "untitled <type>" placeholder the card shows), the content becomes the body, and the
// optional fields (notes, labels, relates-to) become their own labeled sections only when present. Bookkeeping fields
// (timestamps, approval, ids) are deliberately left out - this shares the substance of an entry, not its metadata.
const specToMarkdown = function (spec: Spec): string {
    const heading = spec.title !== '' ? spec.title : `untitled ${spec.type}`;
    const lines = [`# ${heading}`, '', spec.content.trim()];
    if (spec.notes.trim() !== '') {
        lines.push('', '## Notes', '', spec.notes.trim());
    }
    if (spec.labels.length > 0) {
        lines.push('', `**Labels:** ${spec.labels.join(', ')}`);
    }
    if (spec.relatesTo.length > 0) {
        lines.push('', `**Relates to:** ${spec.relatesTo.join(', ')}`);
    }
    return `${lines.join('\n')}\n`;
};

export { specToMarkdown };
