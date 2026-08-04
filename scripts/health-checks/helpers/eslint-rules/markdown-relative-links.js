// Custom ESLint rule for markdown files (parsed by @eslint/markdown): every link, image, and link
// definition whose target is a relative (or root-relative) path must resolve to an existing file
// or directory. External targets (http:, https:, mailto:, and any other URI scheme, plus
// protocol-relative "//") and same-file fragment links ("#...") are skipped, and "#fragment" /
// "?query" suffixes are stripped before resolution - anchors themselves are not verified.
// Used by eslint.markdown.config.js (the "eslint:markdown" script in package.json.ts).

import fs from 'node:fs';
import path from 'node:path';

// Matches a URI scheme prefix (http:, https:, mailto:, tel:, ...).
const URI_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;

/** @type {import('@eslint/markdown').MarkdownRuleDefinition} */
const markdownRelativeLinks = {
    meta: {
        type: 'problem',
        docs: {
            description: 'Require relative markdown links and images to resolve to existing files or directories'
        },
        messages: {
            unresolved: 'Link target "{{target}}" does not resolve to an existing file or directory'
        }
    },
    create(context) {
        const checkNode = function (node) {
            const url = String(node.url || '').trim();
            if (
                url === '' ||
                url.startsWith('#') ||
                url.startsWith('//') ||
                URI_SCHEME_PATTERN.test(url)
            ) {
                return;
            }

            let target = url.split('#', 1)[0].split('?', 1)[0];
            if (target === '') {
                return;
            }
            try {
                target = decodeURIComponent(target);
            } catch {
                // Keep the raw target when it is not valid percent-encoding.
            }

            const resolvedPath = target.startsWith('/') ?
                path.join(context.cwd, target) :
                path.resolve(path.dirname(context.filename), target);

            if (!fs.existsSync(resolvedPath)) {
                context.report({
                    node,
                    messageId: 'unresolved',
                    data: { target: url }
                });
            }
        };

        return {
            definition: checkNode,
            image: checkNode,
            link: checkNode
        };
    }
};

export { markdownRelativeLinks };
